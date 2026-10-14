import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ClinicContentFacade } from './application/facades/clinic-content-facade';
import { ClinicContentFacadePort } from './application/facades/clinic-content-facade-port';
import { ClinicRepository } from './infrastructure/repositories/clinic.repository';
import { ServiceRepository } from './infrastructure/repositories/service.repository';
import { StaffRepository } from './infrastructure/repositories/staff.repository';
import { HoursRepository } from './infrastructure/repositories/hours.repository';
import { DocumentRepository } from './infrastructure/repositories/document.repository';
import { GetClinicHoursHandler } from './application/handlers/get-clinic-hours.handler';
import { GetClinicContactHandler } from './application/handlers/get-clinic-contact.handler';
import { ListServicesHandler } from './application/handlers/list-services.handler';
import { GetServiceHandler } from './application/handlers/get-service.handler';
import { ListStaffHandler } from './application/handlers/list-staff.handler';
import { ListDocumentsHandler } from './application/handlers/list-documents.handler';
import { GetDocumentDownloadHandler } from './application/handlers/get-document-download.handler';
import { ClinicContentController } from './presentation/clinic-content.controller';

/**
 * Clinic Content bounded context (schema: content) — M2: seven sessionless
 * public reads (clinic-content.yaml), CDN-cacheable.
 */
@Module({
  imports: [CqrsModule],
  controllers: [ClinicContentController],
  providers: [
    ClinicContentFacade,
    { provide: ClinicContentFacadePort, useExisting: ClinicContentFacade },
    ClinicRepository,
    ServiceRepository,
    StaffRepository,
    HoursRepository,
    DocumentRepository,
    GetClinicHoursHandler,
    GetClinicContactHandler,
    ListServicesHandler,
    GetServiceHandler,
    ListStaffHandler,
    ListDocumentsHandler,
    GetDocumentDownloadHandler,
  ],
  exports: [ClinicContentFacadePort],
})
export class ClinicContentModule {}
