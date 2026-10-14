import { ShippingAddressDto } from '../dto/commerce.requests.dto';
import type { FulfilmentMethod } from '../money';

/** POST /checkout/quote — deterministic totals for the current cart. */
export class CheckoutQuoteQuery {
  constructor(
    public readonly userId: string,
    public readonly fulfilmentMethod: FulfilmentMethod,
    public readonly shippingAddress?: ShippingAddressDto,
  ) {}
}
