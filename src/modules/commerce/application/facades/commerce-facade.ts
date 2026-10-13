import { Injectable } from '@nestjs/common';
import { CommerceFacadePort } from './commerce-facade-port';

/**
 * Concrete facade for the Commerce context (§3). Body is bus delegation only —
 * no business logic. Methods are added alongside their handlers.
 */
@Injectable()
export class CommerceFacade extends CommerceFacadePort {}
