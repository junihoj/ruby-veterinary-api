import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Intake request bodies (intake.yaml). The global ValidationPipe whitelists
 * strictly: unknown fields are 400 VALIDATION_FAILED. Contact phones are
 * E.164 (data-model/care-coordination.md).
 */

const E164 = /^\+[1-9]\d{6,14}$/;
const ISO_COUNTRY = /^[A-Za-z]{2}$/;

export type PetSpeciesInput = 'dog' | 'cat' | 'bird' | 'rabbit' | 'other';

/** POST /appointment-requests (anonymous-capable form). */
export class AppointmentRequestCreateDto {
  @IsString()
  @MaxLength(200)
  contactName: string;

  @Matches(E164, { message: 'contactPhone must be an E.164 number.' })
  contactPhone: string;

  @IsEmail()
  contactEmail: string;

  @IsString()
  @MaxLength(200)
  petName: string;

  @IsOptional()
  @IsIn(['dog', 'cat', 'other'])
  petSpecies?: 'dog' | 'cat' | 'other';

  @IsString()
  @MaxLength(2000)
  reason: string;

  @IsOptional()
  @IsDateString()
  preferredWindowStart?: string;

  @IsOptional()
  @IsDateString()
  preferredWindowEnd?: string;

  @IsOptional()
  @IsIn(['routine', 'soon', 'urgent'])
  urgency?: 'routine' | 'soon' | 'urgent';
}

/** POST /clients/intake (anonymous-capable form). */
export class IntakeSubmissionCreateDto {
  @IsString()
  @MaxLength(200)
  contactName: string;

  @Matches(E164, { message: 'contactPhone must be an E.164 number.' })
  contactPhone: string;

  @IsEmail()
  contactEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @Matches(ISO_COUNTRY, {
    message: 'country must be an ISO 3166-1 alpha-2 code.',
  })
  country?: string;

  @IsOptional()
  @IsBoolean()
  existingClient?: boolean;

  @IsOptional()
  @IsString()
  preferredVetUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  historyUploadIds?: string[];
}

/** POST /uploads/sign (Bearer). */
export class SignUploadDto {
  @IsIn(['medical_history', 'cms_media'])
  purpose: 'medical_history' | 'cms_media';

  @IsString()
  @MaxLength(255)
  filename: string;

  @IsIn(['application/pdf', 'image/jpeg'])
  mimeType: 'application/pdf' | 'image/jpeg';

  // Cap enforced in the handler as 413 UPLOAD_TOO_LARGE (contract), not here.
  @IsInt()
  @Min(1)
  byteSize: number;
}

/** PATCH /admin/appointment-requests/{id} — triage transition. */
export class TriageAppointmentRequestDto {
  @IsIn(['triaged', 'scheduled', 'declined', 'cancelled'])
  status: 'triaged' | 'scheduled' | 'declined' | 'cancelled';
}

/** PATCH /admin/clients/intake/{id} — review transition (accept has its own op). */
export class UpdateIntakeSubmissionDto {
  @IsIn(['in_review', 'rejected'])
  status: 'in_review' | 'rejected';
}

/** One pet drafted at intake acceptance (also the pet-claim filing shape). */
export class PetDraftDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsIn(['dog', 'cat', 'bird', 'rabbit', 'other'])
  species: PetSpeciesInput;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  breed?: string;

  @IsOptional()
  @IsIn(['female', 'male', 'unknown'])
  sex?: 'female' | 'male' | 'unknown';

  @IsOptional()
  @IsBoolean()
  neutered?: boolean;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  microchipId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** POST /admin/clients/intake/{id}/accept. */
export class AcceptIntakeSubmissionDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PetDraftDto)
  pets: PetDraftDto[];
}

/** PATCH /admin/uploads/{id} — finalise or reject. */
export class UpdateHistoryUploadDto {
  @IsIn(['finalised', 'rejected'])
  status: 'finalised' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;
}
