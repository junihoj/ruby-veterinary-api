import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { PharmacyFacadePort } from '../../../pharmacy-authorisation/application/facades/pharmacy-facade-port';
import { OrderRepository } from '../../infrastructure/repositories/order.repository';
import { toOrderDto } from '../dto/commerce.mapper';
import { OrderDto } from '../dto/commerce.responses.dto';
import { ListOrdersQuery } from '../queries/list-orders.query';

@QueryHandler(ListOrdersQuery)
export class ListOrdersHandler implements IQueryHandler<ListOrdersQuery> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly pharmacy: PharmacyFacadePort,
  ) {}

  async execute(query: ListOrdersQuery): Promise<{
    data: OrderDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    // parseCursor turns the prefixed cursor back into a UUID (400 on garbage).
    const rows = await this.orders.listByUser(
      query.userId,
      query.limit,
      parseCursor(query.cursor),
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    // M5: Rx state per order, read through the pharmacy facade port.
    const data: OrderDto[] = [];
    for (const row of page) {
      const dto = toOrderDto(row);
      dto.prescriptionStatus = await this.pharmacy.getOrderStatus(row.id);
      data.push(dto);
    }

    return {
      data,
      nextCursor: hasMore
        ? PrefixedId.format('order', page[page.length - 1].id)
        : null,
      hasMore,
    };
  }
}
