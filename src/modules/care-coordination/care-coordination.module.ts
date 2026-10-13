import { Module } from '@nestjs/common';
import { CareCoordinationFacade } from './application/facades/care-coordination-facade';
import { CareCoordinationFacadePort } from './application/facades/care-coordination-facade-port';

/**
 * CareCoordination bounded context (schema: intake) — M1 stub (§3, §12).
 * Command/query handler arrays and controllers are added in its phase.
 */
@Module({
  providers: [
    CareCoordinationFacade,
    {
      provide: CareCoordinationFacadePort,
      useExisting: CareCoordinationFacade,
    },
  ],
  exports: [CareCoordinationFacadePort],
})
export class CareCoordinationModule {}
