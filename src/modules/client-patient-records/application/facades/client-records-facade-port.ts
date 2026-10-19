import type { FileIntakeCommand } from '../commands/file-intake.command';
import type { CreateClientCommand } from '../commands/create-client.command';
import type { CreateMedicalHistoryRecordCommand } from '../commands/create-medical-history-record.command';
import type { CreatePetCommand } from '../commands/create-pet.command';
import type { SetPrimaryVeterinarianCommand } from '../commands/set-primary-veterinarian.command';
import type { UpdateClientCommand } from '../commands/update-client.command';
import type { UpdatePetCommand } from '../commands/update-pet.command';
import type {
  ClientDto,
  MedicalHistoryRecordDto,
  MedicalHistoryRecordUploadDto,
  PetDto,
  PetSummaryDto,
  PrimaryVeterinarianLinkDto,
} from '../dto/client-records.responses.dto';
import type { GetClientQuery } from '../queries/get-client.query';
import type { GetPetQuery } from '../queries/get-pet.query';
import type { ListClientPetsQuery } from '../queries/list-client-pets.query';
import type { ListClientsQuery } from '../queries/list-clients.query';
import type { ListMedicalHistoryQuery } from '../queries/list-medical-history.query';
import type { ListMyPetsQuery } from '../queries/list-my-pets.query';
import type { ListPrimaryVeterinariansQuery } from '../queries/list-primary-veterinarians.query';

/** One pet as drafted at intake acceptance (validated before reaching here). */
export interface IntakePetInput {
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

/** Flow 2 filing result — accepted intake outcome echoed by care coordination. */
export interface FileIntakeResult {
  clientId: string;
  pets: PetSummaryDto[];
}

/** Shared page shape (commerce PagedResult twin). */
export interface PagedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Public API of the ClientPatientRecords context (§6.1). Other modules
 * depend only on this abstract port, bound to the concrete facade with
 * `useExisting` (§3). Schema: clients.
 *
 * `fileIntake` is the normative Flow 2 entry point: care coordination's
 * accept operation routes every intake-born Client/Pet write through it —
 * no module ever writes the clients schema directly. `getPet` is the pet
 * prefill/claim read commerce consumes from M5 on (Rx enforcement itself is
 * deferred to M5).
 */
export abstract class ClientRecordsFacadePort {
  /** Owner pet-claim surface (GET /pets equivalent). */
  abstract listMyPets(query: ListMyPetsQuery): Promise<PetSummaryDto[]>;
  /** Pet detail for cross-context consumers (404 on unknown/deleted). */
  abstract getPet(query: GetPetQuery): Promise<PetDto>;
  /** Flow 2: file an accepted intake (create or attach to existing client). */
  abstract fileIntake(command: FileIntakeCommand): Promise<FileIntakeResult>;

  abstract listClients(
    query: ListClientsQuery,
  ): Promise<PagedResult<ClientDto>>;
  abstract createClient(command: CreateClientCommand): Promise<ClientDto>;
  abstract getClient(
    query: GetClientQuery,
  ): Promise<ClientDto & { pets: PetDto[] }>;
  abstract updateClient(command: UpdateClientCommand): Promise<ClientDto>;
  abstract listClientPets(query: ListClientPetsQuery): Promise<PetDto[]>;
  abstract createPet(command: CreatePetCommand): Promise<PetDto>;
  abstract updatePet(command: UpdatePetCommand): Promise<PetDto>;
  abstract listMedicalHistory(
    query: ListMedicalHistoryQuery,
  ): Promise<MedicalHistoryRecordDto[]>;
  abstract createMedicalHistoryRecord(
    command: CreateMedicalHistoryRecordCommand,
  ): Promise<MedicalHistoryRecordUploadDto>;
  abstract listPrimaryVeterinarians(
    query: ListPrimaryVeterinariansQuery,
  ): Promise<PrimaryVeterinarianLinkDto[]>;
  abstract setPrimaryVeterinarian(
    command: SetPrimaryVeterinarianCommand,
  ): Promise<PrimaryVeterinarianLinkDto>;
}
