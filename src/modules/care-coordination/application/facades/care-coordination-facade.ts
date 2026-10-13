import { Injectable } from '@nestjs/common';
import { CareCoordinationFacadePort } from './care-coordination-facade-port';

/**
 * Concrete facade for the CareCoordination context (§3). Body is bus delegation only —
 * no business logic. Methods are added alongside their handlers.
 */
@Injectable()
export class CareCoordinationFacade extends CareCoordinationFacadePort {}
