import { Injectable } from '@nestjs/common';
import { OperationsFacadePort } from './operations-facade-port';

/**
 * Concrete facade for the Operations context (§3). Body is bus delegation only —
 * no business logic. Methods are added alongside their handlers.
 */
@Injectable()
export class OperationsFacade extends OperationsFacadePort {}
