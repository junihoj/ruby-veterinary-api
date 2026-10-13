import { Module } from '@nestjs/common';
import { CommerceFacade } from './application/facades/commerce-facade';
import { CommerceFacadePort } from './application/facades/commerce-facade-port';

/**
 * Commerce bounded context (schema: commerce) — M1 stub (§3, §12).
 * Command/query handler arrays and controllers are added in its phase.
 */
@Module({
  providers: [
    CommerceFacade,
    { provide: CommerceFacadePort, useExisting: CommerceFacade },
  ],
  exports: [CommerceFacadePort],
})
export class CommerceModule {}
