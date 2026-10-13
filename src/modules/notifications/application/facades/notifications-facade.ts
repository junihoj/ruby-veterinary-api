import { Injectable } from '@nestjs/common';
import { NotificationsFacadePort } from './notifications-facade-port';

/**
 * Concrete facade for the Notifications context (§3). Body is bus delegation only —
 * no business logic. Methods are added alongside their handlers.
 */
@Injectable()
export class NotificationsFacade extends NotificationsFacadePort {}
