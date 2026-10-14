import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ShippingAddressDto } from '../../application/dto/commerce.requests.dto';
import { DuplicateOrderKeyError, StockConflictError } from '../errors';
import { isUniqueViolation } from '../prisma-errors';

const orderInclude = {
  items: { include: { product: { select: { name: true } } } },
  fulfilments: true,
  payments: true,
} satisfies Prisma.OrderInclude;

export interface PlaceOrderLine {
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  petId: string | null;
}

export interface PlaceOrderInput {
  userId: string;
  cartId: string;
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

  /** Returns the new order id; throws StockConflictError/DuplicateOrderKeyError. */
  async placeOrder(input: PlaceOrderInput): Promise<string> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        for (const line of input.lines) {
          const reserved = await tx.$executeRaw`
            UPDATE commerce.product_variants
               SET stock_reserved = stock_reserved + ${line.quantity}
             WHERE id = ${line.variantId}::uuid
               AND stock_quantity - stock_reserved >= ${line.quantity}`;
          if (reserved === 0) throw new StockConflictError();
        }

        const order = await tx.order.create({
          data: {
            userId: input.userId,
            status: 'pending_payment',
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

        for (const line of input.lines) {
          await tx.orderItem.create({
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

        await tx.cart.update({
          where: { id: input.cartId },
          data: { status: 'converted' },
        });
        await tx.cartItem.deleteMany({ where: { cartId: input.cartId } });
        return order.id;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'uq_orders_idempotency')) {
        throw new DuplicateOrderKeyError();
      }
      throw error;
    }
  }
}
