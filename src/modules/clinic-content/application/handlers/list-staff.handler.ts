import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { ListStaffQuery } from '../queries/list-staff.query';
import { StaffRepository } from '../../infrastructure/repositories/staff.repository';
import { StaffProfileDto } from '../dto/clinic-content.dto';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { toStaffProfileDto } from '../dto/clinic-content.mapper';

@QueryHandler(ListStaffQuery)
export class ListStaffHandler implements IQueryHandler<ListStaffQuery> {
  constructor(private readonly staff: StaffRepository) {}

  async execute(query: ListStaffQuery): Promise<{
    data: StaffProfileDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const rows = await this.staff.findPublished(
      query.limit,
      parseCursor(query.cursor),
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      data: page.map(toStaffProfileDto),
      nextCursor: hasMore
        ? PrefixedId.format('staffProfile', page[page.length - 1].id)
        : null,
      hasMore,
    };
  }
}
