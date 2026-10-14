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

export interface PagedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Public API of the ClinicContent context (§6.1). Other modules depend only
 * on this abstract port, bound to the concrete facade with `useExisting` (§3).
 *
 * M2: the seven sessionless public reads (clinic-content.yaml).
 */
export abstract class ClinicContentFacadePort {
  abstract getClinicHours(query: GetClinicHoursQuery): Promise<ClinicHoursDto>;
  abstract getClinicContact(
    query: GetClinicContactQuery,
  ): Promise<ClinicContactDto>;
  abstract listServices(
    query: ListServicesQuery,
  ): Promise<PagedResult<ServiceSummaryDto>>;
  abstract getService(query: GetServiceQuery): Promise<ServiceDetailDto>;
  abstract listStaff(
    query: ListStaffQuery,
  ): Promise<PagedResult<StaffProfileDto>>;
  abstract listDocuments(
    query: ListDocumentsQuery,
  ): Promise<PagedResult<DocumentSummaryDto>>;
  abstract getDocumentDownload(
    query: GetDocumentDownloadQuery,
  ): Promise<DocumentDownloadDto>;
}
