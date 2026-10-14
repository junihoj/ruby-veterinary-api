import { Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IdempotencyStore } from '../../../../shared/idempotency/idempotency.store';
import { PaymentRepository } from '../../infrastructure/repositories/payment.repository';
import { HandlePaymentWebhookCommand } from '../commands/handle-payment-webhook.command';
import { PaymentWebhookAckDto } from '../dto/commerce.responses.dto';

/**
 * Payment webhook processing (webhooks.yaml): verify → immediate 200 →
 * dedupe by provider event id → state transition. Every transition is
 * conditional in the repository, so a replayed or out-of-order event can
 * never capture, cancel, or fulfil twice.
 */
@CommandHandler(HandlePaymentWebhookCommand)
export class HandlePaymentWebhookHandler implements ICommandHandler<HandlePaymentWebhookCommand> {
  private readonly logger = new Logger(HandlePaymentWebhookHandler.name);

  constructor(
    private readonly payments: PaymentRepository,
    private readonly store: IdempotencyStore,
  ) {}

  async execute(
    command: HandlePaymentWebhookCommand,
  ): Promise<PaymentWebhookAckDto> {
    const scope = 'webhook:payments';

    const existing = await this.store.find(scope, command.event.id);
    if (existing) {
      if (existing.requestHash !== command.requestHash) {
        this.logger.warn(
          `Payments webhook ${command.event.id} replayed with a different payload; acknowledged without processing.`,
        );
      }
      return { received: true, duplicate: true };
    }

    const payment = await this.payments.findByGatewayRef(
      command.event.data.payment_ref ?? '',
    );
    if (!payment) {
      // Unknown reference: acknowledge (the provider would only retry) and
      // leave the Operations alert to the notifications context (M6).
      this.logger.warn(
        `Payments webhook referenced unknown payment ${command.event.data.payment_ref ?? '(none)'}.`,
      );
      return { received: true, duplicate: false };
    }

    const lines = payment.order.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    }));

    switch (command.event.type) {
      case 'payment_intent.succeeded':
        await this.payments.confirmCapture(payment.id, payment.orderId, lines);
        break;
      case 'payment_intent.payment_failed':
        await this.payments.failPending(
          payment.id,
          payment.orderId,
          'gateway_declined',
          lines,
        );
        break;
      case 'charge.refunded':
        await this.payments.refundCaptured(payment.id, payment.orderId);
        break;
      default:
        this.logger.warn(
          `Payments webhook: ignoring unsupported event type ${command.event.type}.`,
        );
        return { received: true, duplicate: false, ignored: true };
    }

    await this.store.record({
      scope,
      key: command.event.id,
      userId: null,
      requestHash: command.requestHash,
      responseStatus: 200,
      responseBody: null,
    });
    return { received: true, duplicate: false };
  }
}
