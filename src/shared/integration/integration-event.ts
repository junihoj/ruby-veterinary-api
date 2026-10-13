import { randomUUID } from 'node:crypto';

/**
 * Base for cross-context integration events (§7). Past-tense, immutable, with
 * a stable `eventName` matching one entry in `domain-events.md`. Events carry
 * ids and snapshots, never a database row from another schema.
 *
 * Handlers publish AFTER the transaction commits; consumers are idempotent and
 * dedupe by `event.id`.
 */
export abstract class IntegrationEvent<TPayload = unknown> {
  abstract readonly eventName: string;

  readonly eventId: string = randomUUID();
  readonly occurredAt: Date = new Date();

  constructor(readonly payload: TPayload) {}
}
