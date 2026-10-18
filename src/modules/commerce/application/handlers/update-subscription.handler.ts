import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SubscriptionRepository } from '../../infrastructure/repositories/subscription.repository';
import { toSubscriptionDto } from '../dto/commerce.mapper';
import { SubscriptionDto } from '../dto/commerce.responses.dto';
import { notFound } from '../errors';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { UpdateSubscriptionCommand } from '../commands/update-subscription.command';

/**
 * PATCH /subscriptions/{id} (M3b): pause, resume (active), or cancel. A
 * cancel stores the optional reason; resuming clears it. Unknown or foreign
 * ids are 404.
 */
@CommandHandler(UpdateSubscriptionCommand)
export class UpdateSubscriptionHandler implements ICommandHandler<UpdateSubscriptionCommand> {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async execute(command: UpdateSubscriptionCommand): Promise<SubscriptionDto> {
    const subscriptionId = PrefixedId.tryAnyToUuid(command.subscriptionId);
    if (!subscriptionId) throw notFound('Subscription not found.');

    const updated = await this.subscriptions.updateOwned(
      command.userId,
      subscriptionId,
      {
        status: command.input.status,
        ...(command.input.status === 'cancelled'
          ? { cancelReason: command.input.cancelReason ?? null }
          : { cancelReason: null }),
      },
    );
    if (!updated) throw notFound('Subscription not found.');

    const row = await this.subscriptions.findOwned(
      command.userId,
      subscriptionId,
    );
    if (!row) throw notFound('Subscription not found.');
    return toSubscriptionDto(row);
  }
}
