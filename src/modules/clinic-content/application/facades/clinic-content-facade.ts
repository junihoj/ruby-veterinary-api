import { Injectable } from '@nestjs/common';
import { ClinicContentFacadePort } from './clinic-content-facade-port';

/**
 * Concrete facade for the ClinicContent context (§3). Body is bus delegation only —
 * no business logic. Methods are added alongside their handlers.
 */
@Injectable()
export class ClinicContentFacade extends ClinicContentFacadePort {}
