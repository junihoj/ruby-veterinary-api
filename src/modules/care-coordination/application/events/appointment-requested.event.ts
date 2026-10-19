import { IntegrationEvent } from '../../../../shared/integration/integration-event';

/**
 * M4 care-path events (domain-events.md). First IntegrationEvents in the
 * codebase — past-tense, immutable, published post-commit through the
 * in-process publisher; consumers arrive with M6 (notifications, operations).
 */

export interface AppointmentRequestedPayload {
  appointmentRequestId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  petName: string;
  petSpecies: string | null;
  reason: string;
  urgency: string;
  preferredWindowStart: string | null;
  preferredWindowEnd: string | null;
}

export class AppointmentRequested extends IntegrationEvent<AppointmentRequestedPayload> {
  readonly eventName = 'AppointmentRequested';
}
