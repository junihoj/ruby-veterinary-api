import {
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
} from 'class-validator';

/**
 * Client & patient record request bodies (client-records.yaml). The global
 * ValidationPipe whitelists strictly: unknown fields are 400
 * VALIDATION_FAILED. Phone numbers are E.164 (data model).
 */

const E164 = /^\+[1-9]\d{6,14}$/;
const ISO_COUNTRY = /^[A-Za-z]{2}$/;

/** POST /admin/clients. */
export class ClientCreateDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsString()
  @MaxLength(200)
  displayName: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @Matches(E164, { message: 'phone must be an E.164 number.' })
  phone: string;

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
  @IsIn(['phone', 'email', 'whatsapp'])
  preferredContact?: 'phone' | 'email' | 'whatsapp';

  @IsIn(['intake', 'walk_in', 'existing_import'])
  source: 'intake' | 'walk_in' | 'existing_import';
}

/** PATCH /admin/clients/{id} — partial update; soft-delete via status. */
export class ClientUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Matches(E164, { message: 'phone must be an E.164 number.' })
  phone?: string;

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
  @IsIn(['phone', 'email', 'whatsapp'])
  preferredContact?: 'phone' | 'email' | 'whatsapp';

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

/** POST /admin/clients/{id}/pets. */
export class PetCreateDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsIn(['dog', 'cat', 'bird', 'rabbit', 'other'])
  species: 'dog' | 'cat' | 'bird' | 'rabbit' | 'other';

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

/** PATCH /admin/pets/{id} — partial update; deceased keeps history queryable. */
export class PetUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn(['dog', 'cat', 'bird', 'rabbit', 'other'])
  species?: 'dog' | 'cat' | 'bird' | 'rabbit' | 'other';

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

  @IsOptional()
  @IsIn(['active', 'deceased'])
  status?: 'active' | 'deceased';
}

/**
 * POST /admin/pets/{id}/medical-history — creates the record and returns a
 * presigned PUT (the admin download-file precedent). The 10 MB cap is
 * enforced in the handler as 413 (contract), not here.
 */
export class MedicalHistoryCreateDto {
  @IsString()
  @MaxLength(300)
  title: string;

  @IsString()
  @MaxLength(255)
  fileName: string;

  @IsIn(['application/pdf', 'image/jpeg'])
  mimeType: 'application/pdf' | 'image/jpeg';

  @IsInt()
  @Min(1)
  byteSize: number;

  @IsOptional()
  @IsDateString()
  visitDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string;
}

/** POST /admin/pets/{id}/primary-vet. */
export class SetPrimaryVeterinarianDto {
  @IsString()
  veterinarianUserId: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
