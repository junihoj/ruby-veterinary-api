import { AddCartItemDto } from '../dto/commerce.requests.dto';

/** POST /cart/items — add (or merge into) a cart line. */
export class AddCartItemCommand {
  constructor(
    public readonly userId: string,
    public readonly input: AddCartItemDto,
  ) {}
}
