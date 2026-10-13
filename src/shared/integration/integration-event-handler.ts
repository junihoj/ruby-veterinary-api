import { SetMetadata } from '@nestjs/common';

/**
 * Marks a class as an integration-event consumer (§7). Registration is via the
 * explorer service at bootstrap; consuming contexts list handlers explicitly in
 * their module just like command handlers.
 */
export const INTEGRATION_EVENT_HANDLER_METADATA = 'integrationEventHandler';

export function IntegrationEventHandler(
  event: new (...args: never[]) => unknown,
): ClassDecorator {
  return SetMetadata(INTEGRATION_EVENT_HANDLER_METADATA, event);
}
