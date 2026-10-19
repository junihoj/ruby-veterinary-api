import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateClientCommand } from '../commands/create-client.command';
import { CreateMedicalHistoryRecordCommand } from '../commands/create-medical-history-record.command';
import { CreatePetCommand } from '../commands/create-pet.command';
import { FileIntakeCommand } from '../commands/file-intake.command';
import { SetPrimaryVeterinarianCommand } from '../commands/set-primary-veterinarian.command';
import { UpdateClientCommand } from '../commands/update-client.command';
import { UpdatePetCommand } from '../commands/update-pet.command';
import {
  ClientDto,
  MedicalHistoryRecordDto,
  MedicalHistoryRecordUploadDto,
  PetDto,
  PetSummaryDto,
  PrimaryVeterinarianLinkDto,
} from '../dto/client-records.responses.dto';
import { GetClientQuery } from '../queries/get-client.query';
import { GetPetQuery } from '../queries/get-pet.query';
import { ListClientPetsQuery } from '../queries/list-client-pets.query';
import { ListClientsQuery } from '../queries/list-clients.query';
import { ListMedicalHistoryQuery } from '../queries/list-medical-history.query';
import { ListMyPetsQuery } from '../queries/list-my-pets.query';
import { ListPrimaryVeterinariansQuery } from '../queries/list-primary-veterinarians.query';
import {
  ClientRecordsFacadePort,
  FileIntakeResult,
  PagedResult,
} from './client-records-facade-port';

/**
 * Concrete facade for the ClientPatientRecords context (§3). Body is bus
 * delegation only — no business logic. Handlers own the behaviour.
 */
@Injectable()
export class ClientPatientRecordsFacade extends ClientRecordsFacadePort {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {
    super();
  }

  listMyPets(query: ListMyPetsQuery): Promise<PetSummaryDto[]> {
    return this.queries.execute(query);
  }
  getPet(query: GetPetQuery): Promise<PetDto> {
    return this.queries.execute(query);
  }
  fileIntake(command: FileIntakeCommand): Promise<FileIntakeResult> {
    return this.commands.execute(command);
  }
  listClients(query: ListClientsQuery): Promise<PagedResult<ClientDto>> {
    return this.queries.execute(query);
  }
  createClient(command: CreateClientCommand): Promise<ClientDto> {
    return this.commands.execute(command);
  }
  getClient(query: GetClientQuery): Promise<ClientDto & { pets: PetDto[] }> {
    return this.queries.execute(query);
  }
  updateClient(command: UpdateClientCommand): Promise<ClientDto> {
    return this.commands.execute(command);
  }
  listClientPets(query: ListClientPetsQuery): Promise<PetDto[]> {
    return this.queries.execute(query);
  }
  createPet(command: CreatePetCommand): Promise<PetDto> {
    return this.commands.execute(command);
  }
  updatePet(command: UpdatePetCommand): Promise<PetDto> {
    return this.commands.execute(command);
  }
  listMedicalHistory(
    query: ListMedicalHistoryQuery,
  ): Promise<MedicalHistoryRecordDto[]> {
    return this.queries.execute(query);
  }
  createMedicalHistoryRecord(
    command: CreateMedicalHistoryRecordCommand,
  ): Promise<MedicalHistoryRecordUploadDto> {
    return this.commands.execute(command);
  }
  listPrimaryVeterinarians(
    query: ListPrimaryVeterinariansQuery,
  ): Promise<PrimaryVeterinarianLinkDto[]> {
    return this.queries.execute(query);
  }
  setPrimaryVeterinarian(
    command: SetPrimaryVeterinarianCommand,
  ): Promise<PrimaryVeterinarianLinkDto> {
    return this.commands.execute(command);
  }
}
