import { IntegrationEvent } from '../../../../shared/integration/integration-event';

export interface IntakeCompletePayload {
  intakeSubmissionId: string;
  clientId: string;
  petIds: string[];
  /** Submission owner — the account the client record is linked to. */
  userId: string | null;
}

export class IntakeComplete extends IntegrationEvent<IntakeCompletePayload> {
  readonly eventName = 'IntakeComplete';
}
