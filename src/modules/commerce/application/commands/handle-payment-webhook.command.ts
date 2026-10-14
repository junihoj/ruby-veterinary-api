/** Signed inbound payment event (webhooks.yaml payments). */
export interface PaymentWebhookEvent {
  id: string;
  type: string;
  data: {
    payment_ref?: string;
    order_ref?: string;
    amount?: string;
    currency?: string;
  };
}

/**
 * POST /webhooks/payments — signature already verified at the edge;
 * `requestHash` is the sha256 of the raw body for dedupe integrity.
 */
export class HandlePaymentWebhookCommand {
  constructor(
    public readonly event: PaymentWebhookEvent,
    public readonly requestHash: string,
  ) {}
}
