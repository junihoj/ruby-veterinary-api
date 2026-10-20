import { IntegrationEvent } from '../../../../shared/integration/integration-event';

export interface PrescriptionRequestedPayload {
  prescriptionRequestId: string;
  orderId: string;
  petId: string;
  veterinarianUserId: string;
  orderItemIds: string[];
}

export class PrescriptionRequested extends IntegrationEvent<PrescriptionRequestedPayload> {
  readonly eventName = 'PrescriptionRequested';
}
