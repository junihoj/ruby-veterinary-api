import { Injectable } from '@nestjs/common';
import { CareMessagingFacadePort } from './care-messaging-facade-port';

/**
 * Concrete facade for the CareMessaging context (§3). Body is bus delegation only —
 * no business logic. Methods are added alongside their handlers.
 */
@Injectable()
export class CareMessagingFacade extends CareMessagingFacadePort {}
