import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { IntegrationEvent } from './integration-event';
import { IntegrationEventPublisher } from './integration-event-publisher';

/**
 * In-process adapter over @nestjs/cqrs EventBus (§6.2). Publishing here
 * dispatches to subscribers registered by the explorer service.
 */
@Injectable()
export class InProcessEventPublisher extends IntegrationEventPublisher {
  constructor(private readonly eventBus: EventBus) {
    super();
  }

  publish(event: IntegrationEvent<unknown>): void {
    this.eventBus.publish(event);
  }

  publishAll(events: IntegrationEvent<unknown>[]): void {
    if (events.length > 0) this.eventBus.publishAll(events);
  }
}
