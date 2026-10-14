import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import { toCartDto } from '../dto/commerce.mapper';
import { CartDto } from '../dto/commerce.responses.dto';
import { GetCartQuery } from '../queries/get-cart.query';

@QueryHandler(GetCartQuery)
export class GetCartHandler implements IQueryHandler<GetCartQuery> {
  constructor(private readonly carts: CartRepository) {}

  async execute(query: GetCartQuery): Promise<CartDto> {
    // Never mutates: a caller without a cart sees the empty shape and is
    // expected to POST /cart when they start shopping.
    const cart = await this.carts.findOpenByUserId(query.userId);
    return toCartDto(cart);
  }
}
