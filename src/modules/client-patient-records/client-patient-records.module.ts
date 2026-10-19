import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { IdentityModule } from '../identity/identity.module';
import { ClientPatientRecordsFacade } from './application/facades/client-patient-records-facade';
import { ClientRecordsFacadePort } from './application/facades/client-records-facade-port';
import { CreateClientHandler } from './application/handlers/create-client.handler';
import { CreateMedicalHistoryRecordHandler } from './application/handlers/create-medical-history-record.handler';
import { CreatePetHandler } from './application/handlers/create-pet.handler';
import { FileIntakeHandler } from './application/handlers/file-intake.handler';
import { GetClientHandler } from './application/handlers/get-client.handler';
import { GetPetHandler } from './application/handlers/get-pet.handler';
import { ListClientPetsHandler } from './application/handlers/list-client-pets.handler';
import { ListClientsHandler } from './application/handlers/list-clients.handler';
import { ListMedicalHistoryHandler } from './application/handlers/list-medical-history.handler';
import { ListMyPetsHandler } from './application/handlers/list-my-pets.handler';
import { ListPrimaryVeterinariansHandler } from './application/handlers/list-primary-veterinarians.handler';
import { SetPrimaryVeterinarianHandler } from './application/handlers/set-primary-veterinarian.handler';
import { UpdateClientHandler } from './application/handlers/update-client.handler';
import { UpdatePetHandler } from './application/handlers/update-pet.handler';
import { ClientRepository } from './infrastructure/repositories/client.repository';
import { PetRepository } from './infrastructure/repositories/pet.repository';
import { AdminClientsController } from './presentation/admin-clients.controller';
import { AdminPetsController } from './presentation/admin-pets.controller';
import { OwnerPetsController } from './presentation/owner-pets.controller';

const HANDLERS = [
  CreateClientHandler,
  CreateMedicalHistoryRecordHandler,
  CreatePetHandler,
  FileIntakeHandler,
  GetClientHandler,
  GetPetHandler,
  ListClientPetsHandler,
  ListClientsHandler,
  ListMedicalHistoryHandler,
  ListMyPetsHandler,
  ListPrimaryVeterinariansHandler,
  SetPrimaryVeterinarianHandler,
  UpdateClientHandler,
  UpdatePetHandler,
];

/**
 * ClientPatientRecords bounded context (schema: clients) — M4. Owns client
 * and patient records: the staff roster (care:write), the owner pet-claim
 * read, medical-history records with presigned uploads, primary-veterinarian
 * links, and the Flow 2 `fileIntake` entry point that Care Coordination's
 * acceptance calls through the port. Imports Identity for the veterinarian
 * role resolution (port-owned cross-context read).
 */
@Module({
  imports: [CqrsModule, IdentityModule],
  controllers: [
    OwnerPetsController,
    AdminClientsController,
    AdminPetsController,
  ],
  providers: [
    ClientRepository,
    PetRepository,
    ...HANDLERS,
    ClientPatientRecordsFacade,
    {
      provide: ClientRecordsFacadePort,
      useExisting: ClientPatientRecordsFacade,
    },
  ],
  exports: [ClientRecordsFacadePort],
})
export class ClientPatientRecordsModule {}
