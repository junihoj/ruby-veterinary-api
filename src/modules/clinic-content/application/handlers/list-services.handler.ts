import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { ListServicesQuery } from '../queries/list-services.query';
import { ServiceRepository } from '../../infrastructure/repositories/service.repository';
import { ServiceSummaryDto } from '../dto/clinic-content.dto';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';

@QueryHandler(ListServicesQuery)
export class ListServicesHandler implements IQueryHandler<ListServicesQuery> {
  constructor(private readonly services: ServiceRepository) {}

  async execute(query: ListServicesQuery): Promise<{
    data: ServiceSummaryDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const rows = await this.services.findPublished(
      query.limit,
      parseCursor(query.cursor),
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      data: page.map((row) => ({
        id: PrefixedId.format('service', row.id),
        name: row.name,
        slug: row.slug,
        summary: row.summary,
        baselinePrice: row.baselinePrice ? String(row.baselinePrice) : null,
        currency: row.currency,
        category: row.category,
        featured: row.featured,
      })),
      nextCursor: hasMore
        ? PrefixedId.format('service', page[page.length - 1].id)
        : null,
      hasMore,
    };
  }
}
