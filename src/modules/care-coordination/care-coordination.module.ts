import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { IdempotencyStore } from '../../shared/idempotency/idempotency.store';
import { StorageModule } from '../../shared/storage/storage.module';
import { IntegrationEventPublisher } from '../../shared/integration/integration-event-publisher';
import { InProcessEventPublisher } from '../../shared/integration/in-process-event-publisher';
import { ClientPatientRecordsModule } from '../client-patient-records/client-patient-records.module';
import { CareCoordinationFacade } from './application/facades/care-coordination-facade';
import { CareCoordinationFacadePort } from './application/facades/care-coordination-facade-port';
import { FormAlertService } from './application/form-alert.service';
import { AcceptIntakeSubmissionHandler } from './application/handlers/accept-intake-submission.handler';
import { CreateAppointmentRequestHandler } from './application/handlers/create-appointment-request.handler';
import { CreateIntakeSubmissionHandler } from './application/handlers/create-intake-submission.handler';
import { GetHistoryUploadUrlHandler } from './application/handlers/get-history-upload-url.handler';
import { GetIntakeStatusHandler } from './application/handlers/get-intake-status.handler';
import { ListAppointmentRequestsHandler } from './application/handlers/list-appointment-requests.handler';
import { ListHistoryUploadsHandler } from './application/handlers/list-history-uploads.handler';
import { ListIntakeSubmissionsHandler } from './application/handlers/list-intake-submissions.handler';
import { SignUploadHandler } from './application/handlers/sign-upload.handler';
import { TriageAppointmentRequestHandler } from './application/handlers/triage-appointment-request.handler';
import { UpdateHistoryUploadHandler } from './application/handlers/update-history-upload.handler';
import { UpdateIntakeSubmissionHandler } from './application/handlers/update-intake-submission.handler';
import { EmailPort } from './infrastructure/email/email.port';
import { ConsoleEmailAdapter } from './infrastructure/email/console-email.adapter';
import { AppointmentRequestRepository } from './infrastructure/repositories/appointment-request.repository';
import { FormSubmissionAlertRepository } from './infrastructure/repositories/form-submission-alert.repository';
import { HistoryUploadRepository } from './infrastructure/repositories/history-upload.repository';
import { IntakeSubmissionRepository } from './infrastructure/repositories/intake-submission.repository';
import { AdminAppointmentRequestsController } from './presentation/admin-appointment-requests.controller';
import { AdminIntakeController } from './presentation/admin-intake.controller';
import { AdminUploadsController } from './presentation/admin-uploads.controller';
import { AppointmentRequestsController } from './presentation/appointment-requests.controller';
import { ClientsIntakeController } from './presentation/clients-intake.controller';
import { UploadsController } from './presentation/uploads.controller';

const HANDLERS = [
  AcceptIntakeSubmissionHandler,
  CreateAppointmentRequestHandler,
  CreateIntakeSubmissionHandler,
  GetHistoryUploadUrlHandler,
  GetIntakeStatusHandler,
  ListAppointmentRequestsHandler,
  ListHistoryUploadsHandler,
  ListIntakeSubmissionsHandler,
  SignUploadHandler,
  TriageAppointmentRequestHandler,
  UpdateHistoryUploadHandler,
  UpdateIntakeSubmissionHandler,
];

/**
 * CareCoordination bounded context (schema: intake) — M4 care path. Owns the
 * anonymous intake forms (optional auth, 5/10min throttle, idempotency), the
 * staff triage/accept/upload-review surface (care:write), form alert routing
 * through EmailPort (ADR-0013 console adapter), and the four M4 integration
 * events published post-commit. Acceptance writes client/pet rows exclusively
 * through the ClientPatientRecords module (Flow 2) — hence the import.
 */
@Module({
  imports: [CqrsModule, StorageModule, ClientPatientRecordsModule],
  controllers: [
    AppointmentRequestsController,
    ClientsIntakeController,
    UploadsController,
    AdminAppointmentRequestsController,
    AdminIntakeController,
    AdminUploadsController,
  ],
  providers: [
    AppointmentRequestRepository,
    IntakeSubmissionRepository,
    HistoryUploadRepository,
    FormSubmissionAlertRepository,
    FormAlertService,
    { provide: EmailPort, useClass: ConsoleEmailAdapter },
    { provide: IntegrationEventPublisher, useClass: InProcessEventPublisher },
    IdempotencyStore,
    ...HANDLERS,
    CareCoordinationFacade,
    {
      provide: CareCoordinationFacadePort,
      useExisting: CareCoordinationFacade,
    },
  ],
  exports: [CareCoordinationFacadePort],
})
export class CareCoordinationModule {}
