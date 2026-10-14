import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { OrderRepository } from '../../infrastructure/repositories/order.repository';
import { toOrderDto } from '../dto/commerce.mapper';
import { OrderDto } from '../dto/commerce.responses.dto';
import { notFound } from '../errors';
import { GetOrderQuery } from '../queries/get-order.query';

@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery> {
  constructor(private readonly orders: OrderRepository) {}

  async execute(query: GetOrderQuery): Promise<OrderDto> {
    // Owner-scoped: someone else's order is indistinguishable from a
    // missing one (404, never 403 — no existence leaks). Malformed ids are
    // also 404, never a Prisma UUID error downstream.
    const orderId = PrefixedId.tryAnyToUuid(query.orderId);
    if (!orderId) throw notFound('Order not found.');
    const order = await this.orders.findOwn(query.userId, orderId);
    if (!order) throw notFound('Order not found.');
    return toOrderDto(order);
  }
}
