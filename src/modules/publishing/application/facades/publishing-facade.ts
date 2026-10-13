import { Injectable } from '@nestjs/common';
import { PublishingFacadePort } from './publishing-facade-port';

/**
 * Concrete facade for the Publishing context (§3). Body is bus delegation only —
 * no business logic. Methods are added alongside their handlers.
 */
@Injectable()
export class PublishingFacade extends PublishingFacadePort {}
