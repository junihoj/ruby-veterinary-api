import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import { assertCartLinesEligible } from '../cart-eligibility';
import { lineUnitPence } from '../line-pricing';
import { QuoteDto, QuoteLineDto } from '../dto/commerce.responses.dto';
import { badRequest } from '../errors';
import { computeTotals, fromPence } from '../money';
import { CheckoutQuoteQuery } from '../queries/checkout-quote.query';

@QueryHandler(CheckoutQuoteQuery)
export class CheckoutQuoteHandler implements IQueryHandler<CheckoutQuoteQuery> {
  constructor(private readonly carts: CartRepository) {}

  async execute(query: CheckoutQuoteQuery): Promise<QuoteDto> {
    const cart = await this.carts.findOpenByUserId(query.userId);
    if (!cart || cart.items.length === 0) {
      throw badRequest('Your cart is empty.');
    }
    // Throws 422 PRESCRIPTION_PENDING (Rx hold) or 400 (digital rules).
    assertCartLinesEligible(cart.items, query.fulfilmentMethod);

    // Prices re-read live per line (plain variant, fixed parent variant, or
    // the sum of a composite's selections — see line-pricing.ts).
    const lines: QuoteLineDto[] = cart.items.map((item) => {
      const unitPence = lineUnitPence(item);
      return {
        variantId: item.variantId
          ? PrefixedId.format('variant', item.variantId)
          : null,
        quantity: item.quantity,
        unitPrice: fromPence(unitPence),
        lineTotal: fromPence(unitPence * item.quantity),
      };
    });

    const totals = computeTotals(
      cart.items.map((item) => lineUnitPence(item) * item.quantity),
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
