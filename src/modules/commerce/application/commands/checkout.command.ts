import { CheckoutRequestDto } from '../dto/commerce.requests.dto';

/** POST /checkout — reserve stock, place the order, open the payment intent. */
export class CheckoutCommand {
  constructor(
    public readonly userId: string,
    public readonly input: CheckoutRequestDto,
    public readonly idempotencyKey?: string,
  ) {}
}
