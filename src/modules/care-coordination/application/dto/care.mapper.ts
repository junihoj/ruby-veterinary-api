import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import {
  AppointmentRequestDto,
  HistoryUploadDto,
  IntakeSubmissionDto,
} from './care.responses.dto';

/**
 * Row → DTO mapping for the care-coordination context. Prisma payloads are
 * structurally assignable to the row shapes below — only the fields the
 * mapper reads are declared. Ids become prefixed opaque strings
 * (api-specification §Identifiers); Dates become ISO strings.
 */

type DateLike = { toISOString(): string };

export interface AppointmentRequestRow {
  id: string;
  userId: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  petName: string;
  petSpecies: string | null;
  reason: string;
  preferredWindowStart: DateLike | null;
  preferredWindowEnd: DateLike | null;
  urgency: string;
  status: string;
  createdAt: DateLike;
  updatedAt: DateLike;
}

export interface IntakeSubmissionRow {
  id: string;
  userId: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  existingClient: boolean;
  preferredVetUserId: string | null;
  notes: string | null;
  status: string;
  createdAt: DateLike;
  updatedAt: DateLike;
  uploads?: Array<{ id: string }>;
}

export interface HistoryUploadRow {
  id: string;
  appointmentRequestId: string | null;
  intakeSubmissionId: string | null;
  originalFilename: string | null;
  mimeType: string;
  byteSize: number;
  uploadedByUserId: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: DateLike;
}

export function toAppointmentRequestDto(
  row: AppointmentRequestRow,
): AppointmentRequestDto {
  return {
    id: PrefixedId.format('appointmentRequest', row.id),
    userId: row.userId,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    petName: row.petName,
    ...(row.petSpecies ? { petSpecies: row.petSpecies } : {}),
    reason: row.reason,
    ...(row.preferredWindowStart
      ? { preferredWindowStart: row.preferredWindowStart.toISOString() }
      : {}),
    ...(row.preferredWindowEnd
      ? { preferredWindowEnd: row.preferredWindowEnd.toISOString() }
      : {}),
    urgency: row.urgency,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toIntakeSubmissionDto(
  row: IntakeSubmissionRow,
): IntakeSubmissionDto {
  return {
    id: PrefixedId.format('intakeSubmission', row.id),
    userId: row.userId,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    ...(row.addressLine1 ? { addressLine1: row.addressLine1 } : {}),
    ...(row.addressLine2 ? { addressLine2: row.addressLine2 } : {}),
    ...(row.city ? { city: row.city } : {}),
    ...(row.postalCode ? { postalCode: row.postalCode } : {}),
    ...(row.country ? { country: row.country } : {}),
    existingClient: row.existingClient,
    ...(row.preferredVetUserId
      ? {
          preferredVetUserId: PrefixedId.format('user', row.preferredVetUserId),
        }
      : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    status: row.status,
    uploadIds: (row.uploads ?? []).map((upload) =>
      PrefixedId.format('historyUpload', upload.id),
    ),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toHistoryUploadDto(row: HistoryUploadRow): HistoryUploadDto {
  return {
    id: PrefixedId.format('historyUpload', row.id),
    appointmentRequestId: row.appointmentRequestId,
    intakeSubmissionId: row.intakeSubmissionId,
    ...(row.originalFilename ? { fileName: row.originalFilename } : {}),
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    uploadedByUserId: row.uploadedByUserId,
    status: row.status,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
  };
}
