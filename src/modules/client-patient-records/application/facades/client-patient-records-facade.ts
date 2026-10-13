import { Injectable } from '@nestjs/common';
import { ClientRecordsFacadePort } from './client-records-facade-port';

/**
 * Concrete facade for the ClientPatientRecords context (§3). Body is bus delegation only —
 * no business logic. Methods are added alongside their handlers.
 */
@Injectable()
export class ClientPatientRecordsFacade extends ClientRecordsFacadePort {}
