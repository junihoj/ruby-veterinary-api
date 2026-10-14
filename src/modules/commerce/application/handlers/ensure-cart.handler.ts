import { ICommandHandler, CommandHandler } from '@nestjs/cqrs';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import { EnsureCartCommand } from '../commands/ensure-cart.command';
import { toCartDto } from '../dto/commerce.mapper';
import { CartDto } from '../dto/commerce.responses.dto';

@CommandHandler(EnsureCartCommand)
export class EnsureCartHandler implements ICommandHandler<EnsureCartCommand> {
  constructor(private readonly carts: CartRepository) {}

  async execute(command: EnsureCartCommand): Promise<CartDto> {
    const cart = await this.carts.ensureOpenCart(command.userId);
    return toCartDto(cart);
  }
}
