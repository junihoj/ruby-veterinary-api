import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetStaffProfileByUserIdQuery } from '../queries/get-staff-profile-by-user-id.query';
import { StaffRepository } from '../../infrastructure/repositories/staff.repository';
import { toStaffProfileDto } from '../dto/clinic-content.mapper';
import { StaffProfileDto } from '../dto/clinic-content.dto';

@QueryHandler(GetStaffProfileByUserIdQuery)
export class GetStaffProfileByUserIdHandler implements IQueryHandler<GetStaffProfileByUserIdQuery> {
  constructor(private readonly staff: StaffRepository) {}

  async execute(
    query: GetStaffProfileByUserIdQuery,
  ): Promise<StaffProfileDto | null> {
    const row = await this.staff.findPublishedByUserId(query.userId);
    return row ? toStaffProfileDto(row) : null;
  }
}
