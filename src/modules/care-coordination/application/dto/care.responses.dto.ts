/**
 * Intake response bodies (intake.yaml). Nullable-vs-optional follows the
 * contract exactly: `nullable: true` properties serialise explicit nulls;
 * optional non-nullable ones are omitted when absent.
 */

export interface AppointmentRequestDto {
  id: string;
  userId: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  petName: string;
  petSpecies?: string;
  reason: string;
  preferredWindowStart?: string;
  preferredWindowEnd?: string;
  urgency: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeSubmissionDto {
  id: string;
  userId: string | null;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  existingClient: boolean;
  preferredVetUserId?: string;
  notes?: string;
  status: string;
  uploadIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HistoryUploadDto {
  id: string;
  appointmentRequestId: string | null;
  intakeSubmissionId: string | null;
  fileName?: string;
  mimeType: string;
  byteSize: number;
  uploadedByUserId: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

/** Owner-facing pet line (accept results, intake-free summaries). */
export interface PetSummaryDto {
  id: string;
  name: string;
  species: string;
  breed?: string;
  status: string;
}

export interface CreateAppointmentRequestResultDto {
  appointmentRequestId: string;
  status: string;
}

export interface CreateIntakeSubmissionResultDto {
  intakeSubmissionId: string;
  status: string;
}

export interface IntakeStatusDto {
  id: string;
  status: string;
}

export interface SignUploadResultDto {
  uploadId: string | null;
  objectKey: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: string;
}

export interface UploadUrlDto {
  url: string;
  expiresIn: number;
  fileName?: string;
  mimeType: string;
  byteSize: number;
}

export interface AcceptIntakeResultDto {
  status: 'accepted';
  clientId: string;
  pets: PetSummaryDto[];
}
