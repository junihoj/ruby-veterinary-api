import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import { UpdateCartItemCommand } from '../commands/update-cart-item.command';
import { toCartDto } from '../dto/commerce.mapper';
import { CartDto } from '../dto/commerce.responses.dto';
import { badRequest } from '../errors';

@CommandHandler(UpdateCartItemCommand)
export class UpdateCartItemHandler implements ICommandHandler<UpdateCartItemCommand> {
  constructor(private readonly carts: CartRepository) {}

  async execute(command: UpdateCartItemCommand): Promise<CartDto> {
    // The contract lists no 404 for PATCH: an unknown or foreign line is a
    // 400 VALIDATION_FAILED, and stock is re-checked authoritatively at
    // checkout (409 STOCK_CHANGED), not here. A malformed identifier is a
    // 400 too — never a Prisma client-side validation error (500).
    const itemId = PrefixedId.tryAnyToUuid(command.itemId);
    const item = itemId ? await this.carts.findItemById(itemId) : null;
    if (
      !item ||
      item.cart.userId !== command.userId ||
      item.cart.status !== 'open'
    ) {
      throw badRequest('Cart item not found.');
    }

    if (command.quantity === 0) {
      await this.carts.deleteItemOwnedBy(item.id, command.userId);
    } else {
      await this.carts.setLineQuantity(item.id, command.quantity);
    }
    const cart = await this.carts.findOpenByUserId(command.userId);
    return toCartDto(cart);
  }
}
