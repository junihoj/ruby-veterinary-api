import { Module } from '@nestjs/common';
import { ClinicContentFacade } from './application/facades/clinic-content-facade';
import { ClinicContentFacadePort } from './application/facades/clinic-content-facade-port';

/**
 * ClinicContent bounded context (schema: content) — M1 stub (§3, §12).
 * Command/query handler arrays and controllers are added in its phase.
 */
@Module({
  providers: [
    ClinicContentFacade,
    { provide: ClinicContentFacadePort, useExisting: ClinicContentFacade },
  ],
  exports: [ClinicContentFacadePort],
})
export class ClinicContentModule {}
