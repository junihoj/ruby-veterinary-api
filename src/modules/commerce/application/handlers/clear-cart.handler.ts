import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import { ClearCartCommand } from '../commands/clear-cart.command';

@CommandHandler(ClearCartCommand)
export class ClearCartHandler implements ICommandHandler<ClearCartCommand> {
  constructor(private readonly carts: CartRepository) {}

  /** Idempotent: clearing a cart that does not exist is still a 204. */
  async execute(command: ClearCartCommand): Promise<void> {
    await this.carts.clearItems(command.userId);
  }
}
