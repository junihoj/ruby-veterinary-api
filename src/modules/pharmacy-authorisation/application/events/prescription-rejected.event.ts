import { IntegrationEvent } from '../../../../shared/integration/integration-event';

export interface PrescriptionRejectedPayload {
  prescriptionRequestId: string;
  orderId: string;
  veterinarianUserId: string;
  reasonCode: string | null;
  reasonText: string;
}

export class PrescriptionRejected extends IntegrationEvent<PrescriptionRejectedPayload> {
  readonly eventName = 'PrescriptionRejected';
}
