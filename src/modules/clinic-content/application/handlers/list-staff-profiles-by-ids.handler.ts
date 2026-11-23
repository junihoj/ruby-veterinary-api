import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ListStaffProfilesByIdsQuery } from '../queries/list-staff-profiles-by-ids.query';
import { StaffRepository } from '../../infrastructure/repositories/staff.repository';
import { toStaffProfileDto } from '../dto/clinic-content.mapper';
import { StaffProfileDto } from '../dto/clinic-content.dto';

@QueryHandler(ListStaffProfilesByIdsQuery)
export class ListStaffProfilesByIdsHandler implements IQueryHandler<ListStaffProfilesByIdsQuery> {
  constructor(private readonly staff: StaffRepository) {}

  async execute(
    query: ListStaffProfilesByIdsQuery,
  ): Promise<StaffProfileDto[]> {
    const rows = await this.staff.findPublishedByIds(query.ids);
    const byId = new Map(rows.map((row) => [row.id, row]));
    return query.ids
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .map(toStaffProfileDto);
  }
}
