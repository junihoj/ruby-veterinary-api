import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface OrderStockLine {
  variantId: string | null;
  quantity: number;
}

/**
 * Payment lifecycle writes (commerce.md payments). All transitions are
 * conditional (`pending → …` only), so a duplicate or late webhook event is
 * a no-op — "duplicate capture events update status, never double-fulfil".
 * Capture/failure/refund span payments + orders + stock, but every table is
 * commerce-schema, and this is its single writer.
 */
@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByGatewayRef(gatewayPaymentRef: string) {
    if (!gatewayPaymentRef) return null;
    return this.prisma.payment.findFirst({
      where: { gatewayPaymentRef },
      include: {
        order: {
          include: { items: { select: { variantId: true, quantity: true } } },
        },
      },
    });
  }

  /**
   * payment_intent.succeeded: pending → captured, order → paid, reserved
   * stock becomes sold (quantity decremented, reservation released).
   * Returns false when the payment was not pending (already processed).
   */
  async confirmCapture(
    paymentId: string,
    orderId: string,
    lines: OrderStockLine[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: 'pending' },
        data: { status: 'captured', capturedAt: new Date() },
      });
      if (claimed.count === 0) return false;

      await tx.order.updateMany({
        where: {
          id: orderId,
          status: { in: ['pending_payment', 'awaiting_prescription'] },
        },
        data: { status: 'paid' },
      });

      for (const line of lines) {
        if (!line.variantId) continue; // M3b composite components
        await tx.$executeRaw`
          UPDATE commerce.product_variants
             SET stock_quantity = stock_quantity - ${line.quantity},
                 stock_reserved = GREATEST(stock_reserved - ${line.quantity}, 0)
           WHERE id = ${line.variantId}::uuid
             AND stock_reserved >= ${line.quantity}`;
      }
      return true;
    });
  }

  /**
   * payment_intent.payment_failed: pending → failed, order cancelled, the
   * reservation is released honestly (a cancelled order must not hold stock).
   */
  async failPending(
    paymentId: string,
    orderId: string,
    failureCode: string,
    lines: OrderStockLine[],
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: 'pending' },
        data: { status: 'failed', failureCode },
      });
      if (claimed.count === 0) return false;

      await tx.order.updateMany({
        where: { id: orderId, status: 'pending_payment' },
        data: { status: 'cancelled' },
      });

      for (const line of lines) {
        if (!line.variantId) continue;
        await tx.$executeRaw`
          UPDATE commerce.product_variants
             SET stock_reserved = GREATEST(stock_reserved - ${line.quantity}, 0)
           WHERE id = ${line.variantId}::uuid
             AND stock_reserved >= ${line.quantity}`;
      }
      return true;
    });
  }

  /**
   * charge.refunded: captured → refunded, order → refunded. No automatic
   * restock in M3a (returns handling is an operational decision, Phase 5+).
   */
  async refundCaptured(paymentId: string, orderId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: 'captured' },
        data: { status: 'refunded' },
      });
      if (claimed.count === 0) return false;

      await tx.order.updateMany({
        where: {
          id: orderId,
          status: { in: ['paid', 'fulfilling', 'fulfilled'] },
        },
        data: { status: 'refunded' },
      });
      return true;
    });
  }
}
