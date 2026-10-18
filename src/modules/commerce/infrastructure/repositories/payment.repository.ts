import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Payment lifecycle writes (commerce.md payments). All transitions are
 * conditional (`pending → …` only), so a duplicate or late webhook event is
 * a no-op — "duplicate capture events update status, never double-fulfil".
 * Capture/failure/refund span payments + orders + stock, but every table is
 * commerce-schema, and this is its single writer.
 *
 * `confirmCapture` is the *shared* capture path (M3b): the payment webhook
 * and the subscription timer both call it, and it is self-contained — it
 * loads the order's lines itself, settles component/variant stock, issues
 * download grants for downloadable lines, and completes a fully-digital
 * fulfilment.
 */
@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Ids only: every transition method re-loads what it needs in its own tx. */
  async findByGatewayRef(
    gatewayPaymentRef: string,
  ): Promise<{ id: string; orderId: string } | null> {
    if (!gatewayPaymentRef) return null;
    return this.prisma.payment.findFirst({
      where: { gatewayPaymentRef },
      select: { id: true, orderId: true },
    });
  }

  /** The pending payment on a freshly placed order (subscription tick). */
  async findPendingByOrder(orderId: string) {
    return this.prisma.payment.findFirst({
      where: { orderId, status: 'pending' },
      select: { id: true },
    });
  }

  /**
   * payment_intent.succeeded (and subscription auto-orders): pending →
   * captured, order → paid, reserved stock settles (quantity decremented,
   * reservation released) per variant or composite component, one download
   * grant per paid downloadable line (skipDuplicates on
   * `uq_product_download_grants` makes re-issued captures no-ops), and a
   * digital fulfilment completes immediately.
   * Returns false when the payment was not pending (already processed).
   */
  async confirmCapture(paymentId: string, orderId: string): Promise<boolean> {
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

      const items = await tx.orderItem.findMany({
        where: { orderId },
        include: {
          components: true,
          product: { select: { isDownloadable: true } },
        },
      });

      // Settle stock exactly where it was reserved: component variants for
      // composite lines (the fixed-price parent carrier holds no stock),
      // the line variant otherwise.
      for (const item of items) {
        if (item.components.length > 0) {
          for (const component of item.components) {
            const units = component.quantity * item.quantity;
            await tx.$executeRaw`
              UPDATE commerce.product_variants
                 SET stock_quantity = stock_quantity - ${units},
                     stock_reserved = GREATEST(stock_reserved - ${units}, 0)
               WHERE id = ${component.variantId}::uuid
                 AND stock_reserved >= ${units}`;
          }
        } else if (item.variantId) {
          await tx.$executeRaw`
            UPDATE commerce.product_variants
               SET stock_quantity = stock_quantity - ${item.quantity},
                   stock_reserved = GREATEST(stock_reserved - ${item.quantity}, 0)
             WHERE id = ${item.variantId}::uuid
               AND stock_reserved >= ${item.quantity}`;
        }
      }

      // Download grants: one per paid line whose product is downloadable.
      const grantRows = items
        .filter((item) => item.product.isDownloadable)
        .map((item) => ({ orderItemId: item.id, productId: item.productId }));
      if (grantRows.length > 0) {
        await tx.productDownloadGrant.createMany({
          data: grantRows,
          skipDuplicates: true,
        });
      }

      // A `digital` fulfilment is only ever created for a cart whose every
      // line is virtual/downloadable (derived flags, checked at checkout),
      // so completing by method is equivalent to re-deriving the lines here —
      // and stays correct for composite digital carts.
      await tx.fulfilment.updateMany({
        where: { orderId, method: 'digital', status: 'pending' },
        data: { status: 'delivered', completedAt: new Date() },
      });

      return true;
    });
  }

  /**
   * payment_intent.payment_failed: pending → failed, order cancelled, the
   * reservation is released honestly (a cancelled order must not hold stock)
   * for both plain variants and composite components.
   */
  async failPending(
    paymentId: string,
    orderId: string,
    failureCode: string,
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

      // Release exactly what was reserved (components OR the line variant).
      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: {
          variantId: true,
          quantity: true,
          components: { select: { variantId: true, quantity: true } },
        },
      });
      for (const item of items) {
        if (item.components.length > 0) {
          for (const component of item.components) {
            const units = component.quantity * item.quantity;
            await tx.$executeRaw`
              UPDATE commerce.product_variants
                 SET stock_reserved = GREATEST(stock_reserved - ${units}, 0)
               WHERE id = ${component.variantId}::uuid
                 AND stock_reserved >= ${units}`;
          }
        } else if (item.variantId) {
          await tx.$executeRaw`
            UPDATE commerce.product_variants
               SET stock_reserved = GREATEST(stock_reserved - ${item.quantity}, 0)
             WHERE id = ${item.variantId}::uuid
               AND stock_reserved >= ${item.quantity}`;
        }
      }
      return true;
    });
  }

  /**
   * charge.refunded: captured → refunded, order → refunded. No automatic
   * restock in M3a/M3b (returns handling is an operational decision,
   * Phase 5+).
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
