import { Module } from '@nestjs/common';
import { PharmacyAuthorisationFacade } from './application/facades/pharmacy-authorisation-facade';
import { PharmacyFacadePort } from './application/facades/pharmacy-facade-port';

/**
 * PharmacyAuthorisation bounded context (schema: pharmacy) — M1 stub (§3, §12).
 * Command/query handler arrays and controllers are added in its phase.
 */
@Module({
  providers: [
    PharmacyAuthorisationFacade,
    { provide: PharmacyFacadePort, useExisting: PharmacyAuthorisationFacade },
  ],
  exports: [PharmacyFacadePort],
})
export class PharmacyAuthorisationModule {}
