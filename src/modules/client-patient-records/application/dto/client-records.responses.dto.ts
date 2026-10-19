/**
 * Client & patient record response bodies (client-records.yaml).
 * Nullable-vs-optional follows the contract: `nullable: true` properties
 * serialise explicit nulls; optional non-nullable ones are omitted when
 * absent. Dates: date-time columns → ISO strings, date columns → YYYY-MM-DD.
 */

export interface ClientDto {
  id: string;
  userId: string | null;
  displayName: string;
  email?: string;
  phone: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  preferredContact: string;
  source: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PetDto {
  id: string;
  clientId: string;
  name: string;
  species: string;
  breed?: string;
  sex?: string;
  neutered?: boolean;
  dateOfBirth?: string;
  weightKg?: number;
  microchipId?: string;
  notes?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Owner list + intake-accept summaries. */
export interface PetSummaryDto {
  id: string;
  name: string;
  species: string;
  breed?: string;
  status: string;
}

export interface MedicalHistoryRecordDto {
  id: string;
  petId: string;
  title: string;
  mimeType: string;
  byteSize: number;
  source: string;
  uploadedByUserId: string | null;
  visitDate?: string;
  summary?: string;
  createdAt: string;
}

/** POST result: the record plus its presigned PUT (ADR-0016 upload flow). */
export interface MedicalHistoryRecordUploadDto extends MedicalHistoryRecordDto {
  objectKey: string;
  uploadUrl: string;
  uploadExpiresIn: number;
}

/** `effectiveTo: null` marks the current primary veterinarian. */
export interface PrimaryVeterinarianLinkDto {
  veterinarianUserId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}
