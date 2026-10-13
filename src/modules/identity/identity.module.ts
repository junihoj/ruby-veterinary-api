import { Module } from '@nestjs/common';
import { IdentityFacade } from './application/facades/identity-facade';
import { IdentityFacadePort } from './application/facades/identity-facade-port';

/**
 * Identity bounded context (schema: identity) — M1 stub (§3, §12).
 * Command/query handler arrays and controllers are added in Phase 2.
 */
@Module({
  providers: [
    IdentityFacade,
    { provide: IdentityFacadePort, useExisting: IdentityFacade },
  ],
  exports: [IdentityFacadePort],
})
export class IdentityModule {}
