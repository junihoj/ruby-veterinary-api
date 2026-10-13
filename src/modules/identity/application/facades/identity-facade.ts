import { Injectable } from '@nestjs/common';
import { IdentityFacadePort } from './identity-facade-port';

/**
 * Concrete facade for the Identity context (§3). Body is bus delegation only —
 * no business logic. Methods are added alongside their handlers in Phase 2.
 */
@Injectable()
export class IdentityFacade extends IdentityFacadePort {}
