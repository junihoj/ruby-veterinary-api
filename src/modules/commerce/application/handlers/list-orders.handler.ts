import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { OrderRepository } from '../../infrastructure/repositories/order.repository';
import { toOrderDto } from '../dto/commerce.mapper';
import { OrderDto } from '../dto/commerce.responses.dto';
import { ListOrdersQuery } from '../queries/list-orders.query';

@QueryHandler(ListOrdersQuery)
export class ListOrdersHandler implements IQueryHandler<ListOrdersQuery> {
  constructor(private readonly orders: OrderRepository) {}

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

    return {
      data: page.map(toOrderDto),
      nextCursor: hasMore
        ? PrefixedId.format('order', page[page.length - 1].id)
        : null,
      hasMore,
    };
  }
}
