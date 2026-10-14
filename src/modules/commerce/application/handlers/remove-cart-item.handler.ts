import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import { RemoveCartItemCommand } from '../commands/remove-cart-item.command';

@CommandHandler(RemoveCartItemCommand)
export class RemoveCartItemHandler implements ICommandHandler<RemoveCartItemCommand> {
  constructor(private readonly carts: CartRepository) {}

  /** Idempotent: removing an unknown or foreign line is still a 204. */
  async execute(command: RemoveCartItemCommand): Promise<void> {
    // A malformed identifier can never match a row — no-op it rather than
    // letting an unparseable value reach the repository's delete filter.
    const itemId = PrefixedId.tryAnyToUuid(command.itemId);
    if (!itemId) return;
    await this.carts.deleteItemOwnedBy(itemId, command.userId);
  }
}
