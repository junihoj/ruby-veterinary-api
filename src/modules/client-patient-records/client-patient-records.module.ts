import { Module } from '@nestjs/common';
import { ClientPatientRecordsFacade } from './application/facades/client-patient-records-facade';
import { ClientRecordsFacadePort } from './application/facades/client-records-facade-port';

/**
 * ClientPatientRecords bounded context (schema: clients) — M1 stub (§3, §12).
 * Command/query handler arrays and controllers are added in its phase.
 */
@Module({
  providers: [
    ClientPatientRecordsFacade,
    {
      provide: ClientRecordsFacadePort,
      useExisting: ClientPatientRecordsFacade,
    },
  ],
  exports: [ClientRecordsFacadePort],
})
export class ClientPatientRecordsModule {}
