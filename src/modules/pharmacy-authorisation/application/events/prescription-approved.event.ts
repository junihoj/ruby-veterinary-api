import { IntegrationEvent } from '../../../../shared/integration/integration-event';

export interface PrescriptionApprovedPayload {
  prescriptionRequestId: string;
  orderId: string;
  veterinarianUserId: string;
  note: string | null;
}

export class PrescriptionApproved extends IntegrationEvent<PrescriptionApprovedPayload> {
  readonly eventName = 'PrescriptionApproved';
}
