export interface PaymentIntentRequest {
  amount: string; // decimal string, e.g. "96.79"
  currency: string;
  paymentMethodToken: string;
}

export interface PaymentIntent {
  gateway: string;
  gatewayPaymentRef: string;
}

/**
 * Outbound payment gateway boundary (commerce.md payments; ADR-0007):
 * tokenised references only — card data never enters this process. Capture
 * is webhook-driven: we create the intent, the gateway reports back through
 * the signed `POST /webhooks/payments` transport. We never poll.
 */
export abstract class PaymentGatewayPort {
  abstract createIntent(request: PaymentIntentRequest): Promise<PaymentIntent>;
}

/** Gateway outage signal — the checkout handler maps it to 503 DEPENDENCY_UNAVAILABLE. */
export class PaymentGatewayUnavailableError extends Error {
  constructor(message = 'Payment gateway unavailable.') {
    super(message);
    this.name = 'PaymentGatewayUnavailableError';
  }
}
