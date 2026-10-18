import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { SubscriptionRepository } from '../../infrastructure/repositories/subscription.repository';
import { ProductRepository } from '../../infrastructure/repositories/product.repository';
import { toSubscriptionDto } from '../dto/commerce.mapper';
import { SubscriptionDto } from '../dto/commerce.responses.dto';
import { unprocessable } from '../errors';
import { firstDueDate } from '../subscription-schedule';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { CreateSubscriptionCommand } from '../commands/create-subscription.command';

/**
 * POST /subscriptions (M3b): auto-refill is physical simple/variable only —
 * virtual, downloadable, external, grouped, and composite products are all
 * 422 (commerce.md subscriptions invariant). An unknown variant answers the
 * same 422 (no existence leaks, and 404 is not on this operation's contract).
 */
@CommandHandler(CreateSubscriptionCommand)
export class CreateSubscriptionHandler implements ICommandHandler<CreateSubscriptionCommand> {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly products: ProductRepository,
  ) {}

  async execute(command: CreateSubscriptionCommand): Promise<SubscriptionDto> {
    const variantUuid = PrefixedId.tryAnyToUuid(command.input.variantId);
    const variant = variantUuid
      ? await this.products.findVariantWithProduct(variantUuid)
      : null;
    const product = variant?.product;
    const subscribable =
      variant?.active === true &&
      product?.published === true &&
      product.productType !== 'composite' &&
      product.productType !== 'grouped' &&
      product.productType !== 'external' &&
      product.isVirtual === false &&
      product.isDownloadable === false;
    if (!variant || !product || !subscribable) {
      throw unprocessable(
        'SUBSCRIPTION_NOT_AVAILABLE',
        'Only physical, in-stock-style simple or variable products can be subscribed to.',
      );
    }

    const row = await this.subscriptions.create({
      userId: command.userId,
      productId: product.id,
      variantId: variant.id,
      petId: command.input.petId ?? null,
      frequency: command.input.frequency,
      nextOrderAt: firstDueDate(command.input.frequency),
    });
    return toSubscriptionDto(row);
  }
}
