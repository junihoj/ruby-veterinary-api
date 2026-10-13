import { IntegrationEvent } from './integration-event';

/**
 * Outbound port for publishing cross-context integration events (§6.2, §7).
 * In-process only (ADR Rule 7.4 gates any external broker). Handlers call this
 * after their database transaction commits.
 */
export abstract class IntegrationEventPublisher {
  abstract publish(event: IntegrationEvent<unknown>): void;
  abstract publishAll(events: IntegrationEvent<unknown>[]): void;
}
