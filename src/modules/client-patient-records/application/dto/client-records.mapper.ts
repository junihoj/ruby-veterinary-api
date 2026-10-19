import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import {
  ClientDto,
  MedicalHistoryRecordDto,
  PetDto,
  PetSummaryDto,
  PrimaryVeterinarianLinkDto,
} from './client-records.responses.dto';

/**
 * Row → DTO mapping for the client-patient-records context. Prisma payloads
 * are structurally assignable to the row shapes below — only the fields the
 * mapper reads are declared. Ids become prefixed opaque strings; timestamptz
 * → ISO strings, date columns → YYYY-MM-DD.
 */

type DateLike = { toISOString(): string };
type DecimalLike = { toString(): string };

export interface ClientRow {
  id: string;
  userId: string | null;
  displayName: string;
  email: string | null;
  phone: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  preferredContact: string;
  source: string;
  status: string;
  createdAt: DateLike;
  updatedAt: DateLike;
}

export interface PetRow {
  id: string;
  clientId: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  neutered: boolean | null;
  dateOfBirth: DateLike | null;
  weightKg: DecimalLike | null;
  microchipId: string | null;
  notes: string | null;
  status: string;
  createdAt: DateLike;
  updatedAt: DateLike;
}

export interface MedicalHistoryRecordRow {
  id: string;
  petId: string;
  title: string;
  objectKey: string;
  mimeType: string;
  byteSize: number;
  source: string;
  uploadedByUserId: string | null;
  visitDate: DateLike | null;
  summary: string | null;
  createdAt: DateLike;
}

export interface PrimaryVeterinarianLinkRow {
  veterinarianUserId: string;
  effectiveFrom: DateLike;
  effectiveTo: DateLike | null;
}

/** @db.Date columns serialise as calendar dates, not instants. */
function toDateOnly(value: DateLike): string {
  return value.toISOString().slice(0, 10);
}

export function toClientDto(row: ClientRow): ClientDto {
  return {
    id: PrefixedId.format('client', row.id),
    userId: row.userId,
    displayName: row.displayName,
    ...(row.email ? { email: row.email } : {}),
    phone: row.phone,
    ...(row.addressLine1 ? { addressLine1: row.addressLine1 } : {}),
    ...(row.addressLine2 ? { addressLine2: row.addressLine2 } : {}),
    ...(row.city ? { city: row.city } : {}),
    ...(row.postalCode ? { postalCode: row.postalCode } : {}),
    ...(row.country ? { country: row.country } : {}),
    preferredContact: row.preferredContact,
    source: row.source,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPetDto(row: PetRow): PetDto {
  return {
    id: PrefixedId.format('pet', row.id),
    clientId: PrefixedId.format('client', row.clientId),
    name: row.name,
    species: row.species,
    ...(row.breed ? { breed: row.breed } : {}),
    ...(row.sex ? { sex: row.sex } : {}),
    ...(row.neutered !== null ? { neutered: row.neutered } : {}),
    ...(row.dateOfBirth ? { dateOfBirth: toDateOnly(row.dateOfBirth) } : {}),
    ...(row.weightKg ? { weightKg: Number(row.weightKg.toString()) } : {}),
    ...(row.microchipId ? { microchipId: row.microchipId } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPetSummaryDto(row: PetRow): PetSummaryDto {
  return {
    id: PrefixedId.format('pet', row.id),
    name: row.name,
    species: row.species,
    ...(row.breed ? { breed: row.breed } : {}),
    status: row.status,
  };
}

export function toMedicalHistoryRecordDto(
  row: MedicalHistoryRecordRow,
): MedicalHistoryRecordDto {
  return {
    id: PrefixedId.format('medicalHistoryRecord', row.id),
    petId: PrefixedId.format('pet', row.petId),
    title: row.title,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    source: row.source,
    uploadedByUserId: row.uploadedByUserId,
    ...(row.visitDate ? { visitDate: toDateOnly(row.visitDate) } : {}),
    ...(row.summary ? { summary: row.summary } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPrimaryVeterinarianLinkDto(
  row: PrimaryVeterinarianLinkRow,
): PrimaryVeterinarianLinkDto {
  return {
    veterinarianUserId: PrefixedId.format('user', row.veterinarianUserId),
    effectiveFrom: toDateOnly(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? toDateOnly(row.effectiveTo) : null,
  };
}
