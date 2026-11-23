import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetStaffProfileByIdQuery } from '../queries/get-staff-profile-by-id.query';
import { StaffRepository } from '../../infrastructure/repositories/staff.repository';
import { toStaffProfileDto } from '../dto/clinic-content.mapper';
import { StaffProfileDto } from '../dto/clinic-content.dto';

@QueryHandler(GetStaffProfileByIdQuery)
export class GetStaffProfileByIdHandler implements IQueryHandler<GetStaffProfileByIdQuery> {
  constructor(private readonly staff: StaffRepository) {}

  async execute(
    query: GetStaffProfileByIdQuery,
  ): Promise<StaffProfileDto | null> {
    const row = await this.staff.findPublishedById(query.id);
    return row ? toStaffProfileDto(row) : null;
  }
}
