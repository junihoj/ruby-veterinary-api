import { Injectable } from '@nestjs/common';
import { PharmacyFacadePort } from './pharmacy-facade-port';

/**
 * Concrete facade for the PharmacyAuthorisation context (§3). Body is bus delegation only —
 * no business logic. Methods are added alongside their handlers.
 */
@Injectable()
export class PharmacyAuthorisationFacade extends PharmacyFacadePort {}
