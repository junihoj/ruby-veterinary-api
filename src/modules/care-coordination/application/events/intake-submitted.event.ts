import { IntegrationEvent } from '../../../../shared/integration/integration-event';

export interface IntakeSubmittedPayload {
  intakeSubmissionId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  userId: string | null;
  existingClient: boolean;
  uploadIds: string[];
}

export class IntakeSubmitted extends IntegrationEvent<IntakeSubmittedPayload> {
  readonly eventName = 'IntakeSubmitted';
}
