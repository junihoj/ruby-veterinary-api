import { Module } from '@nestjs/common';
import { NotificationsFacade } from './application/facades/notifications-facade';
import { NotificationsFacadePort } from './application/facades/notifications-facade-port';

/**
 * Notifications bounded context (schema: notifications) — M1 stub (§3, §12).
 * Command/query handler arrays and controllers are added in its phase.
 */
@Module({
  providers: [
    NotificationsFacade,
    { provide: NotificationsFacadePort, useExisting: NotificationsFacade },
  ],
  exports: [NotificationsFacadePort],
})
export class NotificationsModule {}
