import { Module } from '@nestjs/common';
import { PublishingFacade } from './application/facades/publishing-facade';
import { PublishingFacadePort } from './application/facades/publishing-facade-port';

/**
 * Publishing bounded context (schema: publishing) — M1 stub (§3, §12).
 * Command/query handler arrays and controllers are added in its phase.
 */
@Module({
  providers: [
    PublishingFacade,
    { provide: PublishingFacadePort, useExisting: PublishingFacade },
  ],
  exports: [PublishingFacadePort],
})
export class PublishingModule {}
