import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import { ProductRepository } from '../../infrastructure/repositories/product.repository';
import { AddCartItemCommand } from '../commands/add-cart-item.command';
import { toCartItemDto } from '../dto/commerce.mapper';
import { CartItemDto } from '../dto/commerce.responses.dto';
import type { ComponentSelectionDto } from '../dto/commerce.requests.dto';
import { badRequest, prescriptionPending, stockChanged } from '../errors';

/** One validated component selection, ready to persist (raw UUIDs). */
interface ResolvedComponent {
  slotId: string;
  productId: string;
  variantId: string;
  quantity: number;
}

/** Per-line advisory stock check (variant for plain lines, components for
 *  composites — each composite component contributes `perLine × line qty`). */
interface StockCheck {
  perLine: number;
  available: number;
}

@CommandHandler(AddCartItemCommand)
export class AddCartItemHandler implements ICommandHandler<AddCartItemCommand> {
  constructor(
    private readonly carts: CartRepository,
    private readonly products: ProductRepository,
  ) {}

  async execute(command: AddCartItemCommand): Promise<CartItemDto> {
    // Pet association: validate the identifier's shape only — existence is
    // enforced by the cross-schema FK and exercised when pet claims ship.
    const petId = command.input.petId
      ? PrefixedId.tryAnyToUuid(command.input.petId)
      : null;
    if (command.input.petId && !petId) throw badRequest('Unknown pet.');

    const resolved = command.input.components?.length
      ? await this.resolveCompositeSelection(command)
      : await this.resolveVariantSelection(command);

    const cart = await this.carts.ensureOpenCart(command.userId);
    const existing = await this.carts.findLine(
      cart.id,
      resolved.productId,
      resolved.lineVariantId,
      petId,
    );
    const targetQuantity = (existing?.quantity ?? 0) + command.input.quantity;

    // Advisory check — checkout re-reserves atomically and is authoritative.
    // For composite lines stock lives on the components, not the line variant.
    for (const check of resolved.stockChecks) {
      const needed = check.perLine * targetQuantity;
      if (needed > check.available) {
        throw stockChanged(
          `Only ${check.available} of this item are available.`,
        );
      }
    }

    const line = existing
      ? await this.mergeLine(
          existing.id,
          command.input.quantity,
          resolved.components,
        )
      : await this.carts.createLine({
          cartId: cart.id,
          productId: resolved.productId,
          variantId: resolved.lineVariantId,
          quantity: command.input.quantity,
          petId,
          components: resolved.components,
        });

    const row = await this.carts.findItemById(line.id);
    return toCartItemDto(row as NonNullable<typeof row>);
  }

  // ---------------------------------------------------------------- composite

  /**
   * Composite path: the product is identified by the selections' slot
   * membership (and cross-checked against variantId when present). Validates
   * slot membership, per-slot min/max, and derived prescription flags, then
   * resolves each component to its purchasable variant.
   */
  private async resolveCompositeSelection(command: AddCartItemCommand) {
    const input = command.input;
    const selections = input.components as ComponentSelectionDto[];

    // Parse before touching Prisma: malformed ids are 400s, never Prisma
    // UUID validation errors downstream.
    const parsed = selections.map((selection) => ({
      slotId: PrefixedId.tryAnyToUuid(selection.slotId),
      productId: PrefixedId.tryAnyToUuid(selection.productId),
      variantId: PrefixedId.tryAnyToUuid(selection.variantId),
      quantity: selection.quantity,
    }));
    if (
      parsed.some(
        (selection) =>
          !selection.slotId || !selection.productId || !selection.variantId,
      )
    ) {
      throw badRequest('Unknown composite selection.');
    }
    const typed = parsed as Array<{
      slotId: string;
      productId: string;
      variantId: string;
      quantity: number;
    }>;

    const slotIds = [...new Set(typed.map((selection) => selection.slotId))];
    const slots = await this.products.findSlotsByIds(slotIds);
    if (slots.length !== slotIds.length) {
      throw badRequest('Unknown composite slot.');
    }
    const productId = slots[0].compositeProductId;
    if (slots.some((slot) => slot.compositeProductId !== productId)) {
      throw badRequest('All selections must belong to the same product.');
    }

    // variantId, when present, must be the composite's default variant
    // (commerce.md: the parent's default variant carries the fixed price).
    let lineVariantId: string | null = null;
    if (input.variantId) {
      const variantId = PrefixedId.tryAnyToUuid(input.variantId);
      if (!variantId) throw badRequest('Unknown product variant.');
      const variant = await this.products.findVariantWithProduct(variantId);
      if (!variant || variant.productId !== productId) {
        throw badRequest('Unknown product variant.');
      }
      lineVariantId = variantId;
    }

    const composite = await this.products.findCompositeForCart(productId);
    if (!composite || composite.productType !== 'composite') {
      throw badRequest('Unknown composite product.');
    }
    if (!composite.published)
      throw badRequest('This product is not available.');

    if (composite.pricingMode === 'fixed') {
      const defaultVariant = composite.variants.find((v) => v.isDefault);
      if (!defaultVariant) {
        throw badRequest('This product is not available for purchase yet.');
      }
      if (lineVariantId !== defaultVariant.id) {
        throw badRequest('This box is priced by its default variant.');
      }
    } else if (lineVariantId !== null) {
      // Sum-priced lines never carry a variant (commerce.md cart_items).
      throw badRequest('This box is priced from its selections.');
    }

    const resolved: Array<
      ResolvedComponent & StockCheck & { requiresPrescription: boolean }
    > = [];
    for (const selection of typed) {
      const slot = composite.compositeSlots.find(
        (candidate) => candidate.id === selection.slotId,
      );
      if (!slot) throw badRequest('Unknown composite slot.');

      const variant = await this.products.findVariantWithProduct(
        selection.variantId,
      );
      if (!variant || variant.productId !== selection.productId) {
        throw badRequest('Unknown composite selection.');
      }
      if (!variant.active) throw badRequest('This option is not available.');
      if (!variant.product.published) {
        throw badRequest('This option is not available.');
      }

      // The selection must be a configured option of that slot: a pinned
      // option only accepts its pinned variant, an unpinned one any active
      // variant of the candidate product.
      const option = slot.options.find(
        (candidate) =>
          candidate.productId === selection.productId &&
          (candidate.componentVariantId === null ||
            candidate.componentVariantId === selection.variantId),
      );
      if (!option) {
        throw badRequest('That choice is not available in this slot.');
      }
      if (
        variant.product.productType !== 'simple' &&
        variant.product.productType !== 'variable'
      ) {
        // commerce.md: options must be simple or variable products.
        throw badRequest('That choice is not available in this slot.');
      }

      resolved.push({
        slotId: selection.slotId,
        productId: selection.productId,
        variantId: selection.variantId,
        quantity: selection.quantity,
        perLine: selection.quantity,
        available: Math.max(variant.stockQuantity - variant.stockReserved, 0),
        requiresPrescription: variant.product.requiresPrescription,
      });
    }

    // Per-slot min/max: each row is one distinct selection (duplicates merge
    // quantities) — the count must sit within [minSelect, maxSelect].
    const merged = new Map<string, (typeof resolved)[number]>();
    for (const component of resolved) {
      const key = `${component.slotId}:${component.productId}:${component.variantId}`;
      const current = merged.get(key);
      if (current) {
        current.quantity += component.quantity;
        current.perLine += component.quantity;
      } else {
        merged.set(key, { ...component });
      }
    }

    const components = [...merged.values()];
    for (const slot of composite.compositeSlots) {
      const count = components.filter(
        (component) => component.slotId === slot.id,
      ).length;
      if (count < slot.minSelect || count > slot.maxSelect) {
        throw badRequest(
          `Choose between ${slot.minSelect} and ${slot.maxSelect} option(s) for every slot.`,
        );
      }
    }

    // Derived prescription flag (OR of the composite and every selected
    // option) — still held for the pharmacy flow (422, M5 lifts it).
    if (
      composite.requiresPrescription ||
      components.some((component) => component.requiresPrescription)
    ) {
      throw prescriptionPending(
        'This item needs veterinary authorisation before it can be added to your cart.',
      );
    }

    return {
      productId,
      lineVariantId,
      components: components.map(
        ({ slotId, productId: componentProductId, variantId, quantity }) => ({
          slotId,
          productId: componentProductId,
          variantId,
          quantity,
        }),
      ),
      stockChecks: components.map(({ perLine, available }) => ({
        perLine,
        available,
      })),
    };
  }

  // ------------------------------------------------------------- plain variant

  /** Simple/variable path — mirrors the M3a flow with product-keyed lines. */
  private async resolveVariantSelection(command: AddCartItemCommand) {
    if (!command.input.variantId) {
      throw badRequest('variantId is required for this product.');
    }
    // Parse before touching Prisma: a malformed UUID would raise a client
    // validation error (500) instead of the contract's 400.
    const variantId = PrefixedId.tryAnyToUuid(command.input.variantId);
    if (!variantId) throw badRequest('Unknown product variant.');
    const variant = await this.products.findVariantWithProduct(variantId);
    if (!variant) throw badRequest('Unknown product variant.');
    const product = variant.product;

    if (!product.published) throw badRequest('This product is not available.');
    if (!variant.active) throw badRequest('This variant is not available.');
    if (product.productType === 'external') {
      throw badRequest(
        'External products are purchased with the partner, not in this cart.',
      );
    }
    if (product.productType === 'grouped') {
      throw badRequest(
        'Grouped products are bought through their member products.',
      );
    }
    if (product.productType === 'composite') {
      throw badRequest('This box needs its slot selections.');
    }
    if (product.requiresPrescription) {
      // Temporary M3a block; lifted when the prescription flow releases it.
      throw prescriptionPending(
        'This item needs veterinary authorisation before it can be added to your cart.',
      );
    }

    return {
      productId: product.id,
      lineVariantId: variantId,
      components: undefined,
      stockChecks: [
        {
          perLine: 1,
          available: Math.max(variant.stockQuantity - variant.stockReserved, 0),
        },
      ],
    };
  }

  /** Merging keeps quantity and replaces the selection with the latest one. */
  private async mergeLine(
    lineId: string,
    quantity: number,
    components: ResolvedComponent[] | undefined,
  ) {
    const line = await this.carts.incrementLine(lineId, quantity);
    if (components?.length) {
      await this.carts.replaceLineComponents(lineId, components);
    }
    return line;
  }
}
