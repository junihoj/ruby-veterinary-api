import { Module } from '@nestjs/common';
import { OperationsFacade } from './application/facades/operations-facade';
import { OperationsFacadePort } from './application/facades/operations-facade-port';

/**
 * Operations bounded context (schema: operations) — M1 stub (§3, §12).
 * Command/query handler arrays and controllers are added in its phase.
 */
@Module({
  providers: [
    OperationsFacade,
    { provide: OperationsFacadePort, useExisting: OperationsFacade },
  ],
  exports: [OperationsFacadePort],
})
export class OperationsModule {}
