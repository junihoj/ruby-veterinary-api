import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  PaymentGatewayPort,
  PaymentIntent,
  PaymentIntentRequest,
} from './payment-gateway.port';

/**
 * Deterministic dev gateway (mock): issues a well-formed reference and never
 * touches card data. Outcomes are decided by the webhook transport, not here
 * — the e2e suite drives `payment_intent.succeeded`,
 * `payment_intent.payment_failed`, and `charge.refunded` by posting signed
 * events to `/webhooks/payments`, which is exactly how a real gateway
 * reports back (ADR-0007, commerce.md payments).
 */
@Injectable()
export class MockPaymentGateway implements PaymentGatewayPort {
  createIntent(request: PaymentIntentRequest): Promise<PaymentIntent> {
    // The token is optional at checkout (commerce.yaml); an absent token is
    // already defaulted by the checkout handler to the mock's test token.
    void request.paymentMethodToken;
    return Promise.resolve({
      gateway: 'mock',
      gatewayPaymentRef: `pi_mock_${randomUUID()}`,
    });
  }
}
