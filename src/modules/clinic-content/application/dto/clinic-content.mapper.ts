import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import type { StaffProfileRow } from '../../infrastructure/repositories/staff.repository';
import { StaffProfileDto } from './clinic-content.dto';

/** Row → DTO for staff profile reads (public and cross-context internal). */
export function toStaffProfileDto(row: StaffProfileRow): StaffProfileDto {
  return {
    id: PrefixedId.format('staffProfile', row.id),
    displayName: row.displayName,
    title: row.title,
    credentials: row.credentials,
    accreditations: row.accreditations,
    bioMd: row.bioMd,
    photoUrl: null, // presigned per-request when needed; kept null in the grid
    specialisms: row.specialisms,
  };
}
