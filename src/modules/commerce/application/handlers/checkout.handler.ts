import { HttpException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ClinicContentFacadePort } from '../../../clinic-content/application/facades/clinic-content-facade-port';
import { GetClinicContactQuery } from '../../../clinic-content/application/queries/get-clinic-contact.query';
import { SubmitPrescriptionHoldCommand } from '../../../pharmacy-authorisation/application/commands/submit-prescription-hold.command';
import { PharmacyFacadePort } from '../../../pharmacy-authorisation/application/facades/pharmacy-facade-port';
import {
  PaymentGatewayPort,
  PaymentGatewayUnavailableError,
  PaymentIntent,
} from '../../infrastructure/payment/payment-gateway.port';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import { PaymentRepository } from '../../infrastructure/repositories/payment.repository';
import {
  OrderRepository,
  PlaceOrderLine,
} from '../../infrastructure/repositories/order.repository';
import {
  assertCartLinesEligible,
  cartLineRequiresPrescription,
} from '../cart-eligibility';
import { CheckoutCommand } from '../commands/checkout.command';
import { toOrderDto } from '../dto/commerce.mapper';
import { OrderDto } from '../dto/commerce.responses.dto';
import { badRequest, dependencyUnavailable, stockChanged } from '../errors';
import {
  DuplicateOrderKeyError,
  StockConflictError,
} from '../../infrastructure/errors';
import { computeTotals, fromPence } from '../money';
import { componentUnitPence, lineUnitPence } from '../line-pricing';

const DEFAULT_PAYMENT_TOKEN = 'pm_mock_default';

@CommandHandler(CheckoutCommand)
export class CheckoutHandler implements ICommandHandler<CheckoutCommand> {
  constructor(
    private readonly carts: CartRepository,
    private readonly orders: OrderRepository,
    private readonly payments: PaymentRepository,
    private readonly gateway: PaymentGatewayPort,
    private readonly clinic: ClinicContentFacadePort,
    private readonly pharmacy: PharmacyFacadePort,
  ) {}

  async execute(command: CheckoutCommand): Promise<OrderDto> {
    const cart = await this.carts.findOpenByUserId(command.userId);
    if (!cart || cart.items.length === 0) {
      throw badRequest('Your cart is empty.');
    }
    const items = cart.items;
    // Rx lines must carry a pet (422 PRESCRIPTION_PENDING defence) / 400
    // (digital eligibility).
    assertCartLinesEligible(items, command.input.fulfilmentMethod);
    const hasRxLines = items.some(cartLineRequiresPrescription);

    const method = command.input.fulfilmentMethod;
    const lineTotalsPence = items.map(
      (item) => lineUnitPence(item) * item.quantity,
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
      const unitPence = lineUnitPence(item);
      return {
        productId: item.productId,
        // null for sum-priced composite lines (components carry the stock).
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: fromPence(unitPence),
        lineTotal: fromPence(unitPence * item.quantity),
        petId: item.petId,
        requiresPrescription: cartLineRequiresPrescription(item),
        components: item.components.map((component) => ({
          slotId: component.slotId,
          productId: component.productId,
          variantId: component.variantId,
          quantity: component.quantity,
          unitPrice: fromPence(componentUnitPence(component)),
        })),
      };
    });

    let placed: {
      orderId: string;
      items: {
        id: string;
        petId: string | null;
        requiresPrescription: boolean;
      }[];
    };
    try {
      placed = await this.orders.placeOrder({
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

    // Flow 4: an Rx order is created `awaiting_prescription`; the pharmacy
    // hold is placed synchronously right after the order commits (one
    // request per order + pet + Rx line set; the pharmacy resolves each
    // pet's primary vet itself). A hold that cannot stand — e.g. the pet
    // has no current primary-vet link (422 PRIMARY_VET_REQUIRED) —
    // compensates the whole order away before the error reaches the client.
    if (hasRxLines) {
      const groups = new Map<string, string[]>();
      for (const item of placed.items) {
        if (!item.requiresPrescription || !item.petId) continue;
        groups.set(item.petId, [...(groups.get(item.petId) ?? []), item.id]);
      }
      try {
        await this.pharmacy.submitHold(
          new SubmitPrescriptionHoldCommand({
            orderId: placed.orderId,
            userId: command.userId,
            ownerNote: null,
            petGroups: [...groups.entries()].map(([petId, orderItemIds]) => ({
              petId,
              orderItemIds,
            })),
          }),
        );
      } catch (error) {
        // Compensating revert (M4 pattern): the order cannot stand without
        // its pharmacy hold — cancel it, release the reservation, fail the
        // pending intent, then surface the original error.
        await this.payments.cancelHeldOrder(placed.orderId, 'rx_hold_failed');
        throw error;
      }
    }

    const order = await this.orders.findOwn(command.userId, placed.orderId);
    const dto = toOrderDto(order as NonNullable<typeof order>);
    if (hasRxLines) {
      dto.prescriptionStatus = await this.pharmacy.getOrderStatus(
        placed.orderId,
      );
    }
    return dto;
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
