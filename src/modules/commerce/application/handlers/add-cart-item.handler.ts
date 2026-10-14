import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import { ProductRepository } from '../../infrastructure/repositories/product.repository';
import { AddCartItemCommand } from '../commands/add-cart-item.command';
import { toCartItemDto } from '../dto/commerce.mapper';
import { CartItemDto } from '../dto/commerce.responses.dto';
import { badRequest, prescriptionPending, stockChanged } from '../errors';

@CommandHandler(AddCartItemCommand)
export class AddCartItemHandler implements ICommandHandler<AddCartItemCommand> {
  constructor(
    private readonly carts: CartRepository,
    private readonly products: ProductRepository,
  ) {}

  async execute(command: AddCartItemCommand): Promise<CartItemDto> {
    if (command.input.components?.length) {
      // The contract accepts components; composite selections ship in M3b.
      throw badRequest('Composite selections are not yet supported.');
    }

    // Parse before touching Prisma: a malformed UUID would raise a client
    // validation error (500) instead of the contract's 400.
    const variantId = PrefixedId.tryAnyToUuid(command.input.variantId);
    if (!variantId) throw badRequest('Unknown product variant.');
    const variant = await this.products.findVariantWithProduct(variantId);
    if (!variant) throw badRequest('Unknown product variant.');
    const product = variant.product;

    // Pet association: validate the identifier's shape only — existence is
    // enforced by the cross-schema FK and exercised when pet claims ship.
    const petId = command.input.petId
      ? PrefixedId.tryAnyToUuid(command.input.petId)
      : null;
    if (command.input.petId && !petId) throw badRequest('Unknown pet.');

    if (!product.published) throw badRequest('This product is not available.');
    if (!variant.active) throw badRequest('This variant is not available.');
    if (product.productType === 'external') {
      throw badRequest(
        'External products are purchased with the partner, not in this cart.',
      );
    }
    if (product.productType === 'composite') {
      throw badRequest('Composite products are not yet purchasable.');
    }
    if (product.productType === 'grouped') {
      throw badRequest(
        'Grouped products are bought through their member products.',
      );
    }
    if (product.requiresPrescription) {
      // Temporary M3a block; lifted when the prescription flow releases it.
      throw prescriptionPending(
        'This item needs veterinary authorisation before it can be added to your cart.',
      );
    }

    const cart = await this.carts.ensureOpenCart(command.userId);
    const available = Math.max(
      variant.stockQuantity - variant.stockReserved,
      0,
    );
    const existing = await this.carts.findLine(cart.id, variant.id, petId);
    const targetQuantity = (existing?.quantity ?? 0) + command.input.quantity;
    // Advisory check — checkout re-reserves atomically and is authoritative.
    if (targetQuantity > available) {
      throw stockChanged(`Only ${available} of this item are available.`);
    }

    const line = existing
      ? await this.carts.incrementLine(existing.id, command.input.quantity)
      : await this.carts.createLine({
          cartId: cart.id,
          productId: product.id,
          variantId: variant.id,
          quantity: command.input.quantity,
          petId,
        });

    const row = await this.carts.findItemById(line.id);
    return toCartItemDto(row as NonNullable<typeof row>);
  }
}
