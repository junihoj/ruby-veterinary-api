import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ShippingAddressDto } from '../../application/dto/commerce.requests.dto';
import { DuplicateOrderKeyError, StockConflictError } from '../errors';
import { isUniqueViolation } from '../prisma-errors';

const orderInclude = {
  items: {
    include: {
      product: { select: { name: true } },
      components: true,
      downloadGrants: true,
    },
  },
  fulfilments: true,
  payments: true,
} satisfies Prisma.OrderInclude;

export interface PlaceOrderComponent {
  slotId: string;
  productId: string;
  variantId: string;
  quantity: number;
  /** Snapshot unit price (option price_override ?? variant price). */
  unitPrice: string;
}

export interface PlaceOrderLine {
  productId: string;
  /** null for sum-priced composite lines. */
  variantId: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  petId: string | null;
  /** Rx line (own flag or derived from components) — engages the pharmacy hold. */
  requiresPrescription: boolean;
  /** Composite selections: the components carry this line's stock. */
  components?: PlaceOrderComponent[];
}

/** The created order plus per-item identity (the Rx hold needs pet → item ids). */
export interface PlacedOrder {
  orderId: string;
  items: Array<{
    id: string;
    productId: string;
    petId: string | null;
    requiresPrescription: boolean;
  }>;
}

export interface PlaceOrderInput {
  userId: string;
  /** null for system-placed subscription auto-orders (no cart to convert). */
  cartId: string | null;
  method: string;
  shippingAddress: ShippingAddressDto | null;
  totals: {
    subtotal: string;
    taxTotal: string;
    shippingTotal: string;
    grandTotal: string;
    currency: string;
  };
  lines: PlaceOrderLine[];
  intent: { gateway: string; gatewayPaymentRef: string };
  idempotencyKey: string | null;
}

/**
 * Order aggregate persistence (commerce.md orders — "strongly consistent").
 * `placeOrder` is the single transactional writer: it reserves stock per
 * variant with a conditional UPDATE (no read-modify-write, so concurrent
 * checkouts can never oversell), creates order/items/fulfilment/payment, and
 * converts the cart — all or nothing.
 */
@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByUser(userId: string, limit: number, cursor?: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: orderInclude,
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async findOwn(userId: string, orderId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: orderInclude,
    });
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.order.findUnique({
      where: { idempotencyKey },
      include: orderInclude,
    });
  }

  /**
   * Returns the created order (id + per-item identity); throws
   * StockConflictError/DuplicateOrderKeyError. An order with Rx lines is
   * created `awaiting_prescription` (Flow 4) — the pharmacy hold engages
   * right after this transaction commits.
   */
  async placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        for (const line of input.lines) {
          if (line.components?.length) {
            // Composite lines reserve their components (commerce.md:
            // "component stock reservation") — the line's own variant, when
            // present, is only the fixed-price carrier and holds no stock.
            for (const component of line.components) {
              const units = component.quantity * line.quantity;
              const reserved = await tx.$executeRaw`
                UPDATE commerce.product_variants
                   SET stock_reserved = stock_reserved + ${units}
                 WHERE id = ${component.variantId}::uuid
                   AND stock_quantity - stock_reserved >= ${units}`;
              if (reserved === 0) throw new StockConflictError();
            }
          } else if (line.variantId) {
            const reserved = await tx.$executeRaw`
              UPDATE commerce.product_variants
                 SET stock_reserved = stock_reserved + ${line.quantity}
               WHERE id = ${line.variantId}::uuid
                 AND stock_quantity - stock_reserved >= ${line.quantity}`;
            if (reserved === 0) throw new StockConflictError();
          }
        }

        const order = await tx.order.create({
          data: {
            userId: input.userId,
            status: input.lines.some((line) => line.requiresPrescription)
              ? 'awaiting_prescription'
              : 'pending_payment',
            subtotal: input.totals.subtotal,
            taxTotal: input.totals.taxTotal,
            shippingTotal: input.totals.shippingTotal,
            grandTotal: input.totals.grandTotal,
            currency: input.totals.currency,
            fulfilmentMethod: input.method,
            shippingAddressJson: input.shippingAddress
              ? { ...input.shippingAddress }
              : undefined,
            idempotencyKey: input.idempotencyKey ?? undefined,
            placedAt: new Date(),
          },
        });

        const items: PlacedOrder['items'] = [];
        for (const line of input.lines) {
          const item = await tx.orderItem.create({
            data: {
              orderId: order.id,
              productId: line.productId,
              variantId: line.variantId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              petId: line.petId ?? undefined,
            },
          });
          items.push({
            id: item.id,
            productId: item.productId,
            petId: item.petId,
            requiresPrescription: line.requiresPrescription,
          });
          if (line.components?.length) {
            // Pick-list snapshot: what was in this box at placement.
            await tx.orderItemComponent.createMany({
              data: line.components.map((component) => ({
                orderItemId: item.id,
                slotId: component.slotId,
                productId: component.productId,
                variantId: component.variantId,
                quantity: component.quantity,
                unitPrice: component.unitPrice,
              })),
            });
          }
        }

        await tx.fulfilment.create({
          data: { orderId: order.id, method: input.method, status: 'pending' },
        });
        await tx.payment.create({
          data: {
            orderId: order.id,
            gateway: input.intent.gateway,
            gatewayPaymentRef: input.intent.gatewayPaymentRef,
            status: 'pending',
            amount: input.totals.grandTotal,
            currency: input.totals.currency,
            idempotencyKey: input.idempotencyKey ?? undefined,
          },
        });

        if (input.cartId) {
          // Components before items — their FK to cart_items has no cascade.
          await tx.cartItemComponent.deleteMany({
            where: { cartItem: { cartId: input.cartId } },
          });
          await tx.cart.update({
            where: { id: input.cartId },
            data: { status: 'converted' },
          });
          await tx.cartItem.deleteMany({ where: { cartId: input.cartId } });
        }
        return { orderId: order.id, items };
      });
    } catch (error) {
      if (isUniqueViolation(error, 'uq_orders_idempotency')) {
        throw new DuplicateOrderKeyError();
      }
      throw error;
    }
  }
}
