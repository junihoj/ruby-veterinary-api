import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ClinicContentFacadePort,
  PagedResult,
} from './clinic-content-facade-port';
import {
  ClinicContactDto,
  ClinicHoursDto,
  DocumentDownloadDto,
  DocumentSummaryDto,
  ServiceDetailDto,
  ServiceSummaryDto,
  StaffProfileDto,
} from '../dto/clinic-content.dto';
import { GetClinicContactQuery } from '../queries/get-clinic-contact.query';
import { GetClinicHoursQuery } from '../queries/get-clinic-hours.query';
import { GetDocumentDownloadQuery } from '../queries/get-document-download.query';
import { GetServiceQuery } from '../queries/get-service.query';
import { ListDocumentsQuery } from '../queries/list-documents.query';
import { ListServicesQuery } from '../queries/list-services.query';
import { ListStaffQuery } from '../queries/list-staff.query';

/**
 * Clinic Content facade (§3): thin delegation to the query bus. Handlers own
 * the behaviour; the controller sees only this port.
 */
@Injectable()
export class ClinicContentFacade implements ClinicContentFacadePort {
  constructor(private readonly queries: QueryBus) {}

  getClinicHours(query: GetClinicHoursQuery): Promise<ClinicHoursDto> {
    return this.queries.execute(query);
  }

  getClinicContact(query: GetClinicContactQuery): Promise<ClinicContactDto> {
    return this.queries.execute(query);
  }

  listServices(
    query: ListServicesQuery,
  ): Promise<PagedResult<ServiceSummaryDto>> {
    return this.queries.execute(query);
  }

  getService(query: GetServiceQuery): Promise<ServiceDetailDto> {
    return this.queries.execute(query);
  }

  listStaff(query: ListStaffQuery): Promise<PagedResult<StaffProfileDto>> {
    return this.queries.execute(query);
  }

  listDocuments(
    query: ListDocumentsQuery,
  ): Promise<PagedResult<DocumentSummaryDto>> {
    return this.queries.execute(query);
  }

  getDocumentDownload(
    query: GetDocumentDownloadQuery,
  ): Promise<DocumentDownloadDto> {
    return this.queries.execute(query);
  }
}
