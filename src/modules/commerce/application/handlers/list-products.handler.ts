import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ProductRepository } from '../../infrastructure/repositories/product.repository';
import { toProductSummary } from '../dto/commerce.mapper';
import { ListProductsQuery } from '../queries/list-products.query';

@QueryHandler(ListProductsQuery)
export class ListProductsHandler implements IQueryHandler<ListProductsQuery> {
  constructor(private readonly products: ProductRepository) {}

  async execute(query: ListProductsQuery): Promise<{
    data: ReturnType<typeof toProductSummary>[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    // parseCursor turns the prefixed cursor back into a UUID (400 on garbage).
    const rows = await this.products.listPublished(
      query.limit,
      parseCursor(query.cursor),
      query.filters,
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      data: page.map((row) => toProductSummary(row, row.variants)),
      nextCursor: hasMore
        ? PrefixedId.format('product', page[page.length - 1].id)
        : null,
      hasMore,
    };
  }
}
