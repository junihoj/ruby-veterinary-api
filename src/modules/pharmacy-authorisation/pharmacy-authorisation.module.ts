import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { IdempotencyStore } from '../../shared/idempotency/idempotency.store';
import { IntegrationEventPublisher } from '../../shared/integration/integration-event-publisher';
import { InProcessEventPublisher } from '../../shared/integration/in-process-event-publisher';
import { ClientPatientRecordsModule } from '../client-patient-records/client-patient-records.module';
import { PharmacyAuthorisationFacade } from './application/facades/pharmacy-authorisation-facade';
import { PharmacyFacadePort } from './application/facades/pharmacy-facade-port';
import { ApprovePrescriptionHandler } from './application/handlers/approve-prescription.handler';
import {
  GetOrderPrescriptionStatusHandler,
  IsOrderApprovedHandler,
} from './application/handlers/order-prescription-state.handler';
import { GetPrescriptionRequestHandler } from './application/handlers/get-prescription-request.handler';
import { ListPrescriptionQueueHandler } from './application/handlers/list-prescription-queue.handler';
import { QueryPrescriptionHandler } from './application/handlers/query-prescription.handler';
import { RejectPrescriptionHandler } from './application/handlers/reject-prescription.handler';
import { SubmitPrescriptionHoldHandler } from './application/handlers/submit-prescription-hold.handler';
import { PatientAssociationRepository } from './infrastructure/repositories/patient-association.repository';
import { PrescriptionDecisionRepository } from './infrastructure/repositories/prescription-decision.repository';
import { PrescriptionRequestRepository } from './infrastructure/repositories/prescription-request.repository';
import { RxAuditRepository } from './infrastructure/repositories/rx-audit.repository';
import { PrescriptionsController } from './presentation/prescriptions.controller';

/** M5: the pharmacy review queue, decision handlers, and the checkout hold. */
export const pharmacyHandlers = [
  SubmitPrescriptionHoldHandler,
  ListPrescriptionQueueHandler,
  GetPrescriptionRequestHandler,
  ApprovePrescriptionHandler,
  RejectPrescriptionHandler,
  QueryPrescriptionHandler,
  GetOrderPrescriptionStatusHandler,
  IsOrderApprovedHandler,
];

@Module({
  imports: [CqrsModule, ClientPatientRecordsModule],
  controllers: [PrescriptionsController],
  providers: [
    ...pharmacyHandlers,
    PharmacyAuthorisationFacade,
    { provide: PharmacyFacadePort, useExisting: PharmacyAuthorisationFacade },
    PrescriptionRequestRepository,
    PrescriptionDecisionRepository,
    RxAuditRepository,
    PatientAssociationRepository,
    IdempotencyStore,
    { provide: IntegrationEventPublisher, useClass: InProcessEventPublisher },
  ],
  exports: [PharmacyFacadePort],
})
export class PharmacyAuthorisationModule {}
