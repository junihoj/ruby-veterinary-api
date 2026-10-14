import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import { assertCartLinesEligible } from '../cart-eligibility';
import { cartItemRows } from '../dto/commerce.mapper';
import { QuoteDto, QuoteLineDto } from '../dto/commerce.responses.dto';
import { badRequest } from '../errors';
import { computeTotals, fromPence, toPence } from '../money';
import { CheckoutQuoteQuery } from '../queries/checkout-quote.query';

@QueryHandler(CheckoutQuoteQuery)
export class CheckoutQuoteHandler implements IQueryHandler<CheckoutQuoteQuery> {
  constructor(private readonly carts: CartRepository) {}

  async execute(query: CheckoutQuoteQuery): Promise<QuoteDto> {
    const cart = await this.carts.findOpenByUserId(query.userId);
    if (!cart || cart.items.length === 0) {
      throw badRequest('Your cart is empty.');
    }
    const items = cartItemRows(cart.items);
    // Throws 422 PRESCRIPTION_PENDING (Rx hold) or 400 (digital/variant rules).
    assertCartLinesEligible(items, query.fulfilmentMethod);

    const lines: QuoteLineDto[] = items.map((item) => {
      const unitPence = toPence(item.variant.price.toString());
      return {
        variantId: PrefixedId.format('variant', item.variantId as string),
        quantity: item.quantity,
        unitPrice: fromPence(unitPence),
        lineTotal: fromPence(unitPence * item.quantity),
      };
    });

    const totals = computeTotals(
      items.map(
        (item) => toPence(item.variant.price.toString()) * item.quantity,
      ),
      query.fulfilmentMethod,
    );

    return {
      fulfilmentMethod: query.fulfilmentMethod,
      currency: totals.currency,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      shippingTotal: totals.shippingTotal,
      grandTotal: totals.grandTotal,
      lines,
    };
  }
}
