import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

const productSelect = {
  select: {
    name: true,
    slug: true,
    productType: true,
    requiresPrescription: true,
    isVirtual: true,
    isDownloadable: true,
  },
};

const cartInclude = {
  items: {
    orderBy: { addedAt: 'asc' },
    include: { variant: { include: { product: productSelect } } },
  },
} satisfies Prisma.CartInclude;

const itemInclude = {
  cart: { select: { id: true, userId: true, status: true } },
  variant: { include: { product: productSelect } },
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
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  }

  async findItemById(itemId: string) {
    return this.prisma.cartItem.findUnique({
      where: { id: itemId },
      include: itemInclude,
    });
  }

  /** Existing line for (cart, variant, pet) — `uq_cart_items_line`. */
  async findLine(
    cartId: string,
    variantId: string,
    petId: string | null,
  ): Promise<{ id: string; quantity: number } | null> {
    return this.prisma.cartItem.findFirst({
      where: { cartId, variantId, petId },
      select: { id: true, quantity: true },
    });
  }

  async createLine(data: {
    cartId: string;
    productId: string;
    variantId: string;
    quantity: number;
    petId: string | null;
  }): Promise<{ id: string }> {
    return this.prisma.cartItem.create({
      data: {
        cartId: data.cartId,
        productId: data.productId,
        variantId: data.variantId,
        quantity: data.quantity,
        petId: data.petId ?? undefined,
      },
      select: { id: true },
    });
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

  /** Ownership-scoped delete: removing another user's line is a no-op (204). */
  async deleteItemOwnedBy(itemId: string, userId: string): Promise<void> {
    await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cart: { userId, status: 'open' } },
    });
  }
}
