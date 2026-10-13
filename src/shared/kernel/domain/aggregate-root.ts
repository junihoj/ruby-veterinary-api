import { AggregateRoot as NestAggregateRoot } from '@nestjs/cqrs';

/**
 * Base for the aggregate roots in the §4.2 inventory (Order, Cart, Product,
 * Prescription, Appointment, Intake, Conversation, Client, Pet).
 *
 * Extends the @nestjs/cqrs AggregateRoot so domain events commit via
 * `commitEvents()`; integration events are buffered separately and published
 * by the handler AFTER the DB transaction commits (§7).
 */
export abstract class AggregateRoot extends NestAggregateRoot {
  private readonly integrationEvents: unknown[] = [];

  /**
   * @param id Prefixed opaque id (see PrefixedId); subclasses pass
   *   `PrefixedId.newId(<entity>)` on creation or `PrefixedId.format(...)` when
   *   rehydrating a row from the database.
   */
  protected constructor(readonly id: string) {
    super();
  }

  protected addIntegrationEvent(event: unknown): void {
    this.integrationEvents.push(event);
  }

  /** Drain the integration-event buffer. Called by handlers post-commit. */
  pullIntegrationEvents(): unknown[] {
    return this.integrationEvents.splice(0, this.integrationEvents.length);
  }
}
