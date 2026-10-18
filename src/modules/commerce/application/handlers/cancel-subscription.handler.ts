import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SubscriptionRepository } from '../../infrastructure/repositories/subscription.repository';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { CancelSubscriptionCommand } from '../commands/cancel-subscription.command';

/**
 * DELETE /subscriptions/{id} (M3b): cancellation stops future orders; the
 * contract documents 204 only — an unknown or foreign id is a 204 no-op
 * (never a 404: without a GET-by-id there is nothing to leak, and the
 * caller's list remains the source of truth).
 */
@CommandHandler(CancelSubscriptionCommand)
export class CancelSubscriptionHandler implements ICommandHandler<CancelSubscriptionCommand> {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async execute(_command: CancelSubscriptionCommand): Promise<void> {
    const subscriptionId = PrefixedId.tryAnyToUuid(_command.subscriptionId);
    if (!subscriptionId) return; // malformed id → documented 204 no-op
    await this.subscriptions.updateOwned(_command.userId, subscriptionId, {
      status: 'cancelled',
      cancelReason: null,
    });
  }
}
