import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { PharmacyFacadePort } from '../../../pharmacy-authorisation/application/facades/pharmacy-facade-port';
import { OrderRepository } from '../../infrastructure/repositories/order.repository';
import { toOrderDto } from '../dto/commerce.mapper';
import { OrderDto } from '../dto/commerce.responses.dto';
import { notFound } from '../errors';
import { GetOrderQuery } from '../queries/get-order.query';

@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly pharmacy: PharmacyFacadePort,
  ) {}

  async execute(query: GetOrderQuery): Promise<OrderDto> {
    // Owner-scoped: someone else's order is indistinguishable from a
    // missing one (404, never 403 — no existence leaks). Malformed ids are
    // also 404, never a Prisma UUID error downstream.
    const orderId = PrefixedId.tryAnyToUuid(query.orderId);
    if (!orderId) throw notFound('Order not found.');
    const order = await this.orders.findOwn(query.userId, orderId);
    if (!order) throw notFound('Order not found.');
    const dto = toOrderDto(order);
    // M5: the Rx state travels with the order (read through the pharmacy
    // facade port — commerce never touches the pharmacy schema).
    dto.prescriptionStatus = await this.pharmacy.getOrderStatus(orderId);
    return dto;
  }
}
