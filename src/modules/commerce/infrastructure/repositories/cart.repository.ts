import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const productSelect = {
  select: {
    name: true,
    slug: true,
    productType: true,
    pricingMode: true,
    requiresPrescription: true,
    isVirtual: true,
    isDownloadable: true,
  },
};

/** Component rows carry everything line pricing and eligibility need. */
const componentInclude = {
  variant: { select: { name: true, price: true, currency: true } },
  product: {
    select: {
      name: true,
      slug: true,
      requiresPrescription: true,
      isVirtual: true,
      isDownloadable: true,
    },
  },
  // For price_override lookup: (slot, product, pinned variant) identity.
  slot: {
    select: {
      options: {
        select: {
          productId: true,
          componentVariantId: true,
          priceOverride: true,
        },
      },
    },
  },
} satisfies Prisma.CartItemComponentInclude;

const cartInclude = {
  items: {
    orderBy: { addedAt: 'asc' },
    include: {
      variant: { select: { name: true, price: true, currency: true } },
      product: productSelect,
      components: { include: componentInclude },
    },
  },
} satisfies Prisma.CartInclude;

const itemInclude = {
  cart: { select: { id: true, userId: true, status: true } },
  variant: { select: { name: true, price: true, currency: true } },
  product: productSelect,
  components: { include: componentInclude },
} satisfies Prisma.CartItemInclude;

/**
 * Cart persistence (commerce.md carts/cart_items). Carts hold no prices —
 * every read prices lines from the live variant, and `uq_carts_open_user`
 * (partial unique in raw SQL) keeps one open cart per user.
 */
@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOpenByUserId(userId: string) {
    return this.prisma.cart.findFirst({
      where: { userId, status: 'open' },
      include: cartInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async ensureOpenCart(userId: string) {
    const existing = await this.findOpenByUserId(userId);
    if (existing) return existing;
    return this.prisma.cart.create({
      data: { userId, status: 'open' },
      include: cartInclude,
    });
  }

  async clearItems(userId: string): Promise<void> {
    const cart = await this.prisma.cart.findFirst({
      where: { userId, status: 'open' },
      select: { id: true },
    });
    if (!cart) return;
    // Components first: the FK to cart_items has no cascade.
    await this.prisma.cartItemComponent.deleteMany({
      where: { cartItem: { cartId: cart.id } },
    });
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }

  async findItemById(itemId: string) {
    return this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: itemInclude,
    });
  }

  /** Existing line for (cart, product, variant, pet) — `uq_cart_items_line`.
   *  Product is part of the key so sum composite lines (variant null) can
   *  never merge across different composite products. */
  async findLine(
    cartId: string,
    productId: string,
    variantId: string | null,
    petId: string | null,
  ): Promise<{ id: string; quantity: number } | null> {
    return this.prisma.cartItem.findFirst({
      where: { cartId, productId, variantId, petId },
      select: { id: true, quantity: true },
    });
  }

  async createLine(data: {
    cartId: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    petId: string | null;
    components?: Array<{
      slotId: string;
      productId: string;
      variantId: string;
      quantity: number;
    }>;
  }): Promise<{ id: string }> {
    return this.prisma.cartItem.create({
      data: {
        cartId: data.cartId,
        productId: data.productId,
        variantId: data.variantId,
        quantity: data.quantity,
        petId: data.petId ?? undefined,
        ...(data.components?.length
          ? {
              components: {
                create: data.components.map((component) => ({
                  slotId: component.slotId,
                  productId: component.productId,
                  variantId: component.variantId,
                  quantity: component.quantity,
                })),
              },
            }
          : {}),
      },
      select: { id: true },
    });
  }

  /** Swap a composite line's selections (re-add with a new configuration). */
  async replaceLineComponents(
    itemId: string,
    components: Array<{
      slotId: string;
      productId: string;
      variantId: string;
      quantity: number;
    }>,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.cartItemComponent.deleteMany({
        where: { cartItemId: itemId },
      }),
      this.prisma.cartItemComponent.createMany({
        data: components.map((component) => ({
          cartItemId: itemId,
          slotId: component.slotId,
          productId: component.productId,
          variantId: component.variantId,
          quantity: component.quantity,
        })),
      }),
    ]);
  }

  async incrementLine(
    itemId: string,
    quantity: number,
  ): Promise<{ id: string }> {
    return this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: { increment: quantity } },
      select: { id: true },
    });
  }

  async setLineQuantity(itemId: string, quantity: number): Promise<void> {
    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  }

  /** Ownership-scoped delete: removing another user's line is a no-op (204).
   *  Components are removed first — their FK to cart_items has no cascade. */
  async deleteItemOwnedBy(itemId: string, userId: string): Promise<void> {
    const ownership = { id: itemId, cart: { userId, status: 'open' } };
    await this.prisma.cartItemComponent.deleteMany({
      where: { cartItem: ownership },
    });
    await this.prisma.cartItem.deleteMany({ where: ownership });
  }
}
