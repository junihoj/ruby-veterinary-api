import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { APP_CONFIG } from '../../../config/config.types';
import type { AppConfig } from '../../../config/config.types';
import {
  PaymentGatewayPort,
  type PaymentIntent,
} from './payment/payment-gateway.port';
import {
  OrderRepository,
  PlaceOrderLine,
} from './repositories/order.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { SubscriptionRepository } from './repositories/subscription.repository';
import { StockConflictError } from './errors';
import { computeTotals, fromPence, toPence } from '../application/money';
import { firstDueDate } from '../application/subscription-schedule';

const MAX_CLAIMS_PER_TICK = 25;
const SUBSCRIPTION_QUANTITY = 1;

/**
 * Subscription auto-refill timer (commerce.md subscriptions, M3b): a plain
 * in-process interval — no queue, no scheduler dependency. Each tick claims
 * due `active` rows with a conditional `next_order_at` advance (a second
 * tick, replica, or racing user update can never double-order), places a
 * system order through the idempotent `placeOrder` path
 * (`Idempotency-Key` = `sub:<id>:<due-date>`), auto-captures it through the
 * shared capture path, and pauses rows that cannot be served.
 *
 * `SUBSCRIPTIONS_TICK_MS=0` disables the timer entirely (e2e drives
 * `tickOnce()` directly).
 */
@Injectable()
export class SubscriptionTickService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionTickService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly subscriptions: SubscriptionRepository,
    private readonly orders: OrderRepository,
    private readonly payments: PaymentRepository,
    private readonly gateway: PaymentGatewayPort,
  ) {}

  onModuleInit(): void {
    const tickMs = this.config.subscriptionsTickMs;
    if (tickMs <= 0) {
      this.logger.log('Subscription timer disabled (SUBSCRIPTIONS_TICK_MS=0).');
      return;
    }
    this.timer = setInterval(() => {
      void this.tickOnce();
    }, tickMs);
    // Never hold the process open just for the refill timer.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * One timer tick. Public so tests (and operators) can drive it directly;
   * re-entrancy guarded so a slow tick never overlaps the next one.
   */
  async tickOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.subscriptions.listDue(
        MAX_CLAIMS_PER_TICK,
        new Date(),
      );
      for (const subscription of due) {
        try {
          await this.processOne(subscription);
        } catch (error) {
          // One broken row must never stall the rest of the tick.
          this.logger.error(
            `Subscription ${subscription.id}: auto-order failed.`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async processOne(
    subscription: Awaited<
      ReturnType<SubscriptionRepository['listDue']>
    >[number],
  ): Promise<void> {
    const dueAt = new Date(subscription.nextOrderAt.getTime());

    // Rx auto-refill needs an approved prescription state per order. M5
    // shipped the review flow but deferred the subscription auto-order
    // loop (each refill would need its own request + approval), so the
    // row keeps pausing instead of ordering (commerce.md subscriptions
    // invariant) — re-enable here once the loop exists.
    if (subscription.product.requiresPrescription) {
      await this.subscriptions.pause(subscription.id);
      this.logger.warn(
        `Subscription ${subscription.id}: paused — prescription items cannot auto-order yet.`,
      );
      return;
    }

    // Claim first: the conditional advance is the concurrency guard.
    const advancedTo = firstDueDate(subscription.frequency, new Date());
    const claimed = await this.subscriptions.claimDue(
      subscription.id,
      dueAt,
      // Advance from now, not from the due date: a long outage skips missed
      // windows instead of firing a catch-up storm.
      advancedTo,
    );
    if (!claimed) return; // raced with another tick or a user update

    const unitPence = toPence(subscription.variant.price.toString());
    const totals = computeTotals([unitPence * SUBSCRIPTION_QUANTITY], 'ship');
    const line: PlaceOrderLine = {
      productId: subscription.productId,
      variantId: subscription.variant.id,
      quantity: SUBSCRIPTION_QUANTITY,
      unitPrice: fromPence(unitPence),
      lineTotal: fromPence(unitPence * SUBSCRIPTION_QUANTITY),
      petId: subscription.petId,
      // Subscriptions are physical simple/variable only (Rx never allowed at
      // creation) — an auto-order can never engage a pharmacy hold.
      requiresPrescription: false,
    };

    let intent: PaymentIntent;
    try {
      intent = await this.gateway.createIntent({
        amount: totals.grandTotal,
        currency: totals.currency,
        paymentMethodToken: 'pm_mock_default',
      });
    } catch {
      // Gateway down: no order was placed, so re-open the due window and
      // retry on the next tick.
      await this.subscriptions.reclaim(subscription.id, advancedTo, dueAt);
      return;
    }

    let orderId: string;
    try {
      orderId = (
        await this.orders.placeOrder({
          userId: subscription.userId,
          cartId: null, // system order — no cart to convert
          method: 'ship',
          shippingAddress: null,
          totals,
          lines: [line],
          intent,
          idempotencyKey: `sub:${subscription.id}:${dueAt.toISOString()}`,
        })
      ).orderId;
    } catch (error) {
      if (error instanceof StockConflictError) {
        // "A due row that cannot reserve stock is paused, not ordered."
        await this.subscriptions.pause(subscription.id);
        this.logger.warn(
          `Subscription ${subscription.id}: paused — stock unavailable for the due order.`,
        );
        return;
      }
      throw error;
    }

    // Auto-capture through the shared capture path: settle stock, issue
    // download grants (n/a for physical subs but harmless), complete
    // fulfilment. Idempotent — a replayed tick no-ops.
    const payment = await this.payments.findPendingByOrder(orderId);
    if (payment) {
      await this.payments.confirmCapture(payment.id, orderId);
    }
  }
}
