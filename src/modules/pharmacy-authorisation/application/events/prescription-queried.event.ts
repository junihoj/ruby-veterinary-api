import { IntegrationEvent } from '../../../../shared/integration/integration-event';

export interface PrescriptionQueriedPayload {
  prescriptionRequestId: string;
  orderId: string;
  veterinarianUserId: string;
  reasonCode: string | null;
  question: string;
}

export class PrescriptionQueried extends IntegrationEvent<PrescriptionQueriedPayload> {
  readonly eventName = 'PrescriptionQueried';
}
