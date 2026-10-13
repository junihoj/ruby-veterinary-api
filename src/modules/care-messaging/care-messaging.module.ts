import { Module } from '@nestjs/common';
import { CareMessagingFacade } from './application/facades/care-messaging-facade';
import { CareMessagingFacadePort } from './application/facades/care-messaging-facade-port';

/**
 * CareMessaging bounded context (schema: messaging) — M1 stub (§3, §12).
 * Command/query handler arrays and controllers are added in its phase.
 */
@Module({
  providers: [
    CareMessagingFacade,
    { provide: CareMessagingFacadePort, useExisting: CareMessagingFacade },
  ],
  exports: [CareMessagingFacadePort],
})
export class CareMessagingModule {}
