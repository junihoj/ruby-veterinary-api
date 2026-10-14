import { HttpException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ClinicContentFacadePort } from '../../../clinic-content/application/facades/clinic-content-facade-port';
import { GetClinicContactQuery } from '../../../clinic-content/application/queries/get-clinic-contact.query';
import {
  PaymentGatewayPort,
  PaymentGatewayUnavailableError,
  PaymentIntent,
} from '../../infrastructure/payment/payment-gateway.port';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import {
  OrderRepository,
  PlaceOrderLine,
} from '../../infrastructure/repositories/order.repository';
import { assertCartLinesEligible } from '../cart-eligibility';
import { CheckoutCommand } from '../commands/checkout.command';
import { cartItemRows, toOrderDto } from '../dto/commerce.mapper';
import { OrderDto } from '../dto/commerce.responses.dto';
import { badRequest, dependencyUnavailable, stockChanged } from '../errors';
import {
  DuplicateOrderKeyError,
  StockConflictError,
} from '../../infrastructure/errors';
import { computeTotals, fromPence, toPence } from '../money';

const DEFAULT_PAYMENT_TOKEN = 'pm_mock_default';

@CommandHandler(CheckoutCommand)
export class CheckoutHandler implements ICommandHandler<CheckoutCommand> {
  constructor(
    private readonly carts: CartRepository,
    private readonly orders: OrderRepository,
    private readonly gateway: PaymentGatewayPort,
    private readonly clinic: ClinicContentFacadePort,
  ) {}

  async execute(command: CheckoutCommand): Promise<OrderDto> {
    const cart = await this.carts.findOpenByUserId(command.userId);
    if (!cart || cart.items.length === 0) {
      throw badRequest('Your cart is empty.');
    }
    const items = cartItemRows(cart.items);
    // 422 PRESCRIPTION_PENDING (Rx hold) / 400 (digital eligibility, M3b lines).
    assertCartLinesEligible(items, command.input.fulfilmentMethod);

    const method = command.input.fulfilmentMethod;
    const lineTotalsPence = items.map(
      (item) => toPence(item.variant.price.toString()) * item.quantity,
    );
    const totals = computeTotals(lineTotalsPence, method);

    // Gateway first: an outage must leave no half-placed order behind
    // (503 DEPENDENCY_UNAVAILABLE, Graceful Degradation Contract).
    let intent: PaymentIntent;
    try {
      intent = await this.gateway.createIntent({
        amount: totals.grandTotal,
        currency: totals.currency,
        paymentMethodToken:
          command.input.paymentMethodToken ?? DEFAULT_PAYMENT_TOKEN,
      });
    } catch (error) {
      if (error instanceof PaymentGatewayUnavailableError) {
        throw await this.dependencyUnavailable();
      }
      throw error;
    }

    const lines: PlaceOrderLine[] = items.map((item) => {
      const unitPence = toPence(item.variant.price.toString());
      return {
        productId: item.productId,
        variantId: item.variantId as string, // asserted non-null above
        quantity: item.quantity,
        unitPrice: fromPence(unitPence),
        lineTotal: fromPence(unitPence * item.quantity),
        petId: item.petId,
      };
    });

    let orderId: string;
    try {
      orderId = await this.orders.placeOrder({
        userId: command.userId,
        cartId: cart.id,
        method,
        shippingAddress: command.input.shippingAddress ?? null,
        totals,
        lines,
        intent,
        idempotencyKey: command.idempotencyKey ?? null,
      });
    } catch (error) {
      if (error instanceof StockConflictError) {
        throw stockChanged(
          'Stock changed while you were checking out. Please review your cart and try again.',
        );
      }
      // Retries never double-order: replay the original when the same key
      // won the unique-constraint race (interceptor record lost mid-flight).
      if (error instanceof DuplicateOrderKeyError && command.idempotencyKey) {
        const original = await this.orders.findByIdempotencyKey(
          command.idempotencyKey,
        );
        if (original && original.userId === command.userId) {
          return toOrderDto(original);
        }
      }
      throw error;
    }

    const order = await this.orders.findOwn(command.userId, orderId);
    return toOrderDto(order as NonNullable<typeof order>);
  }

  /** Graceful Degradation Contract: plain-language fallback + clinic phone. */
  private async dependencyUnavailable(): Promise<HttpException> {
    let suffix = '';
    try {
      const contact = await this.clinic.getClinicContact(
        new GetClinicContactQuery(),
      );
      suffix = ` or call the clinic on ${contact.mainPhone}`;
    } catch {
      // Clinic contact unavailable — degrade the message, never the status.
    }
    return dependencyUnavailable(
      `Payment is temporarily unavailable. Please try again later${suffix}.`,
    );
  }
}
