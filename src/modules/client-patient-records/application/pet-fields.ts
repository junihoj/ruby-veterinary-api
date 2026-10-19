import { PetWriteFields } from '../infrastructure/repositories/client.repository';

/**
 * Draft pet shape shared by Flow 2 filing (IntakePetInput) and staff pet
 * creation (PetCreateDto) — both validate to this structure before reaching
 * the repository.
 */
export interface PetDraftLike {
  name: string;
  species: string;
  breed?: string;
  sex?: string;
  neutered?: boolean;
  dateOfBirth?: string;
  weightKg?: number;
  microchipId?: string;
  notes?: string;
}

export function toPetWriteFields(input: PetDraftLike): PetWriteFields {
  return {
    name: input.name,
    species: input.species,
    breed: input.breed ?? null,
    sex: input.sex ?? null,
    neutered: input.neutered ?? null,
    dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
    weightKg: input.weightKg ?? null,
    microchipId: input.microchipId ?? null,
    notes: input.notes ?? null,
  };
}
