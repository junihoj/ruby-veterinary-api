import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ErrorEnvelope } from '../src/shared/cross-cutting/envelope';
import { PrefixedId } from '../src/shared/kernel/domain/prefixed-id';
import { signProviderPayload } from '../src/modules/commerce/infrastructure/payment/provider-signature';
import type { AuthTokensDto } from '../src/modules/identity/application/dto/auth-response.dto';
import type {
  OrderDto,
  PaymentWebhookAckDto,
  QuoteDto,
} from '../src/modules/commerce/application/dto/commerce.responses.dto';

/** Response envelope typed at the assertion sites (supertest body is any). */
interface Envelope<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}
interface PagedEnvelope<T> {
  data: T[];
  meta: {
    requestId: string;
    timestamp: string;
    pagination: { limit: number; cursor: string | null; hasMore: boolean };
  };
}

/**
 * Checkout e2e (M3a): quote totals (VAT 20% + flat £4.99), the checkout →
 * pending_payment flow with stock reservation, Idempotency-Key replay and
 * conflict semantics, the signed payments webhook state machine
 * (capture / duplicate / decline / refund), and the orders reads — through
 * the production factory (createApp). Requires DATABASE_URL →
 * ruby_veterinary_test, migrated and seeded (`pnpm db:seed`).
 *
 * The suite mutates stock for SKU-JCC-S only (reserve → capture → decline
 * release) and reads it back against a baseline captured at checkout time,
 * so assertions are residue-tolerant across gate runs. Rows are left behind
 * deliberately; the seeder re-baselines stock for the next run.
 */
// The commerce app bootstrap (Swagger scan over 6 more controllers) exceeds
// Jest's 5s default hook timeout under parallel workers.
jest.setTimeout(120_000);

describe('Commerce checkout, idempotency & payments webhook (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000)}`;

  let tokenA = '';
  let tokenB = '';
  const emailA = `buyer-a-${runId}@example.com`;
  const emailB = `buyer-b-${runId}@example.com`;
  const buyerPassword = 'buyer-password-123';

  // Seeded fixtures (SKU-JCC-S + SKU-GUIDE-PUP — untouched by the other
  // commerce suite, which runs in a parallel worker).
  let jointVariantUuid = '';
  let jointSmallVariantId = '';
  let guideVariantId = '';

  // Flow state shared across the sequential describes below.
  let order1Id = '';
  let payment1Ref = '';
  let order2Id = '';
  let payment2Ref = '';
  let jointBaseline = { stockQuantity: 0, stockReserved: 0 };

  const idempotencyKey = `e2e-${runId}-checkout`;
  const checkoutBody = {
    fulfilmentMethod: 'ship',
    shippingAddress: {
      line1: '1 Ruby Lane',
      city: 'London',
      postalCode: 'SW1A 1AA',
      country: 'GB',
    },
  };

  const server = () => request(app.getHttpServer());
  const auth = (token?: string) =>
    token ? { Authorization: `Bearer ${token}` } : {};
  const get = (path: string, token?: string) =>
    server().get(`/api/v1${path}`).set(auth(token));
  const post = (path: string, token?: string) =>
    server().post(`/api/v1${path}`).set(auth(token));
  const del = (path: string, token?: string) =>
    server().delete(`/api/v1${path}`).set(auth(token));

  /** Signs the exact raw body the webhook controller will hash. */
  const postWebhook = (payload: unknown, signature?: string) => {
    const raw = JSON.stringify(payload);
    const body = Buffer.from(raw, 'utf8');
    return server()
      .post('/api/v1/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set(
        'X-Provider-Signature',
        signature ??
          signProviderPayload(
            body,
            process.env.PAYMENT_WEBHOOK_SECRET ??
              'dev-payment-webhook-secret-change-me',
          ),
      )
      .send(raw);
  };

  const readJointVariant = () =>
    prisma.productVariant.findUniqueOrThrow({
      where: { id: jointVariantUuid },
    });

  const getOrder = async (orderId: string, token = tokenA) => {
    const res = await get(`/orders/${orderId}`, token).expect(200);
    return (res.body as Envelope<OrderDto>).data;
  };

  beforeAll(async () => {
    app = (await createApp()) as INestApplication<App>;
    prisma = app.get(PrismaService);

    const [jointSmall, guide] = await Promise.all([
      prisma.productVariant.findUnique({ where: { sku: 'SKU-JCC-S' } }),
      prisma.productVariant.findUnique({ where: { sku: 'SKU-GUIDE-PUP' } }),
    ]);
    if (!jointSmall || !guide) {
      throw new Error(
        'Seed fixtures missing — run `pnpm db:seed` against the test DB first.',
      );
    }
    jointVariantUuid = jointSmall.id;
    jointSmallVariantId = PrefixedId.format('variant', jointSmall.id);
    guideVariantId = PrefixedId.format('variant', guide.id);

    // Two shoppers: A places the orders, B proves cross-user isolation.
    for (const [email, set] of [
      [emailA, (t: string) => (tokenA = t)],
      [emailB, (t: string) => (tokenB = t)],
    ] as const) {
      await post('/auth/register')
        .send({ email, password: buyerPassword })
        .expect(201);
      const login = await post('/auth/login')
        .send({ email, password: buyerPassword })
        .expect(200);
      set((login.body as Envelope<AuthTokensDto>).data.tokens.accessToken);
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('checkout quote', () => {
    it('requires authentication (401)', async () => {
      await post('/checkout/quote')
        .send({ fulfilmentMethod: 'pickup' })
        .expect(401);
    });

    it('answers 400 for a quote with no cart', async () => {
      const res = await post('/checkout/quote', tokenA)
        .send({ fulfilmentMethod: 'ship' })
        .expect(400);
      expect((res.body as ErrorEnvelope).error.code).toBe('VALIDATION_FAILED');
    });

    it('builds the mixed cart the totals assertions use', async () => {
      await post('/cart', tokenA).expect(200);
      await post('/cart/items', tokenA)
        .send({ variantId: jointSmallVariantId, quantity: 2 })
        .expect(201);
      await post('/cart/items', tokenA)
        .send({ variantId: guideVariantId, quantity: 1 })
        .expect(201);

      const cart = (await get('/cart', tokenA).expect(200)).body as Envelope<{
        itemCount: number;
        subtotal: string;
      }>;
      expect(cart.data.itemCount).toBe(3);
      expect(cart.data.subtotal).toBe('36.00');
    });

    it('quotes VAT + flat shipping for ship', async () => {
      const res = await post('/checkout/quote', tokenA)
        .send({ fulfilmentMethod: 'ship' })
        .expect(200);

      const quote = (res.body as Envelope<QuoteDto>).data;
      expect(quote.fulfilmentMethod).toBe('ship');
      expect(quote.currency).toBe('GBP');
      expect(quote.subtotal).toBe('36.00'); // 2×£15.00 + 1×£6.00
      expect(quote.taxTotal).toBe('7.20'); // 20% of subtotal
      expect(quote.shippingTotal).toBe('4.99');
      expect(quote.grandTotal).toBe('48.19');
      expect(quote.lines).toHaveLength(2);
    });

    it('waives shipping for pickup', async () => {
      const res = await post('/checkout/quote', tokenA)
        .send({ fulfilmentMethod: 'pickup' })
        .expect(200);

      const quote = (res.body as Envelope<QuoteDto>).data;
      expect(quote.shippingTotal).toBe('0.00');
      expect(quote.grandTotal).toBe('43.20');
    });

    it('answers 400 for digital with a physical line, and for unknown methods', async () => {
      await post('/checkout/quote', tokenA)
        .send({ fulfilmentMethod: 'digital' })
        .expect(400);
      await post('/checkout/quote', tokenA)
        .send({ fulfilmentMethod: 'drone' })
        .expect(400);
    });

    it('quotes a digital-only cart with zero shipping', async () => {
      await del('/cart', tokenA).expect(204);
      await post('/cart/items', tokenA)
        .send({ variantId: guideVariantId, quantity: 1 })
        .expect(201);

      const res = await post('/checkout/quote', tokenA)
        .send({ fulfilmentMethod: 'digital' })
        .expect(200);

      const quote = (res.body as Envelope<QuoteDto>).data;
      expect(quote.subtotal).toBe('6.00');
      expect(quote.taxTotal).toBe('1.20');
      expect(quote.shippingTotal).toBe('0.00');
      expect(quote.grandTotal).toBe('7.20');
    });
  });

  describe('checkout & idempotency', () => {
    it('places the order, reserves stock, returns pending_payment', async () => {
      // Rebuild the mixed cart (the quote describe emptied it).
      await del('/cart', tokenA).expect(204);
      await post('/cart/items', tokenA)
        .send({ variantId: jointSmallVariantId, quantity: 2 })
        .expect(201);
      await post('/cart/items', tokenA)
        .send({ variantId: guideVariantId, quantity: 1 })
        .expect(201);

      const before = await readJointVariant();
      jointBaseline = {
        stockQuantity: before.stockQuantity,
        stockReserved: before.stockReserved,
      };

      const res = await post('/checkout', tokenA)
        .set('Idempotency-Key', idempotencyKey)
        .send(checkoutBody)
        .expect(201);

      const order = (res.body as Envelope<OrderDto>).data;
      order1Id = order.id;
      payment1Ref = order.payment?.gatewayPaymentRef as string;
      expect(order.id).toMatch(/^ord_[0-9a-f-]{36}$/);
      expect(order.status).toBe('pending_payment');
      expect(order.fulfilmentMethod).toBe('ship');
      expect(order.subtotal).toBe('36.00');
      expect(order.taxTotal).toBe('7.20');
      expect(order.shippingTotal).toBe('4.99');
      expect(order.grandTotal).toBe('48.19');
      expect(order.items).toHaveLength(2);
      expect(order.shippingAddress).toMatchObject({
        line1: '1 Ruby Lane',
        city: 'London',
        postalCode: 'SW1A 1AA',
        country: 'GB',
      });
      expect(order.payment?.status).toBe('pending');
      expect(payment1Ref).toMatch(/^pi_mock_/);
      expect(order.fulfilment?.method).toBe('ship');
      expect(order.fulfilment?.status).toBe('pending');

      const after = await readJointVariant();
      expect(after.stockReserved).toBe(jointBaseline.stockReserved + 2);
    });

    it('replays the same order for a repeated Idempotency-Key', async () => {
      const res = await post('/checkout', tokenA)
        .set('Idempotency-Key', idempotencyKey)
        .send(checkoutBody)
        .expect(201);
      expect((res.body as Envelope<OrderDto>).data.id).toBe(order1Id);
    });

    it('answers 409 when the key is reused with a different body', async () => {
      const res = await post('/checkout', tokenA)
        .set('Idempotency-Key', idempotencyKey)
        .send({ ...checkoutBody, fulfilmentMethod: 'pickup' })
        .expect(409);
      expect((res.body as ErrorEnvelope).error.code).toBe(
        'IDEMPOTENCY_CONFLICT',
      );
    });

    it('answers 400 for checkout with an empty cart', async () => {
      await del('/cart', tokenA).expect(204);
      const res = await post('/checkout', tokenA)
        .send({ fulfilmentMethod: 'pickup' })
        .expect(400);
      expect((res.body as ErrorEnvelope).error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('payments webhook', () => {
    const captureEvent = {
      id: `evt_${runId}-capture`,
      type: 'payment_intent.succeeded',
      data: { payment_ref: '', order_ref: '' },
    };

    beforeAll(() => {
      captureEvent.data.payment_ref = payment1Ref;
      captureEvent.data.order_ref = order1Id;
    });

    it('rejects a bad signature with 401 INVALID_SIGNATURE', async () => {
      const res = await postWebhook(
        {
          id: 'evt_bad_signature',
          type: 'payment_intent.succeeded',
          data: { payment_ref: 'pi_mock_missing' },
        },
        'deadbeef',
      ).expect(401);
      expect((res.body as ErrorEnvelope).error.code).toBe('INVALID_SIGNATURE');
    });

    it('captures the pending payment on payment_intent.succeeded', async () => {
      const res = await postWebhook(captureEvent).expect(200);
      expect((res.body as Envelope<PaymentWebhookAckDto>).data).toEqual({
        received: true,
        duplicate: false,
      });
    });

    it('moves the order to paid and decrements stock exactly once', async () => {
      const order = await getOrder(order1Id);
      expect(order.status).toBe('paid');
      expect(order.payment?.status).toBe('captured');
      expect(order.payment?.capturedAt).toBeTruthy();

      const variant = await readJointVariant();
      expect(variant.stockQuantity).toBe(jointBaseline.stockQuantity - 2);
      expect(variant.stockReserved).toBe(jointBaseline.stockReserved);
    });

    it('acknowledges a duplicate event without applying it twice', async () => {
      const res = await postWebhook(captureEvent).expect(200);
      expect((res.body as Envelope<PaymentWebhookAckDto>).data.duplicate).toBe(
        true,
      );

      const variant = await readJointVariant();
      expect(variant.stockQuantity).toBe(jointBaseline.stockQuantity - 2);
    });

    it('places a second order without a key for the decline path', async () => {
      await del('/cart', tokenA).expect(204);
      await post('/cart/items', tokenA)
        .send({ variantId: jointSmallVariantId, quantity: 1 })
        .expect(201);

      const res = await post('/checkout', tokenA)
        .send({ fulfilmentMethod: 'pickup' })
        .expect(201);

      const order = (res.body as Envelope<OrderDto>).data;
      order2Id = order.id;
      payment2Ref = order.payment?.gatewayPaymentRef as string;
      expect(order.status).toBe('pending_payment');
      expect(payment2Ref).toMatch(/^pi_mock_/);
    });

    it('cancels the order and releases stock on payment_failed', async () => {
      const res = await postWebhook({
        id: `evt_${runId}-decline`,
        type: 'payment_intent.payment_failed',
        data: { payment_ref: payment2Ref, reason: 'card_declined' },
      }).expect(200);
      expect((res.body as Envelope<PaymentWebhookAckDto>).data.received).toBe(
        true,
      );

      const order = await getOrder(order2Id);
      expect(order.status).toBe('cancelled');
      expect(order.payment?.status).toBe('failed');
      expect(order.payment?.failureCode).toBe('gateway_declined');
      expect(order.fulfilment?.method).toBe('pickup');

      const variant = await readJointVariant();
      expect(variant.stockReserved).toBe(jointBaseline.stockReserved);
    });

    it('marks the captured payment refunded on charge.refunded', async () => {
      await postWebhook({
        id: `evt_${runId}-refund`,
        type: 'charge.refunded',
        data: { payment_ref: payment1Ref, amount: '48.19' },
      }).expect(200);

      const order = await getOrder(order1Id);
      expect(order.status).toBe('refunded');
      expect(order.payment?.status).toBe('refunded');

      // Refunds do not restock in M3a.
      const variant = await readJointVariant();
      expect(variant.stockQuantity).toBe(jointBaseline.stockQuantity - 2);
    });

    it('dedupes a re-sent event id before any processing', async () => {
      const res = await postWebhook({
        id: captureEvent.id,
        type: 'charge.refunded',
        data: { payment_ref: payment1Ref },
      }).expect(200);
      expect((res.body as Envelope<PaymentWebhookAckDto>).data.duplicate).toBe(
        true,
      );
    });

    it('answers 200 for unknown payment refs', async () => {
      const res = await postWebhook({
        id: `evt_${runId}-unknown-ref`,
        type: 'payment_intent.succeeded',
        data: { payment_ref: 'pi_mock_does_not_exist' },
      }).expect(200);
      expect((res.body as Envelope<PaymentWebhookAckDto>).data).toEqual({
        received: true,
        duplicate: false,
      });
    });

    it('answers 200 ignored for malformed and unsupported payloads', async () => {
      const malformed = await postWebhook({ totally: 'unrelated' }).expect(200);
      expect((malformed.body as Envelope<PaymentWebhookAckDto>).data).toEqual({
        received: true,
        duplicate: false,
        ignored: true,
      });

      const unsupported = await postWebhook({
        id: `evt_${runId}-other-type`,
        type: 'payment_intent.created',
        data: { payment_ref: payment1Ref },
      }).expect(200);
      expect((unsupported.body as Envelope<PaymentWebhookAckDto>).data).toEqual(
        { received: true, duplicate: false, ignored: true },
      );
    });
  });

  describe('orders & stock race', () => {
    it('lists the shopper orders with pagination meta', async () => {
      const res = await get('/orders?limit=1', tokenA).expect(200);
      const body = res.body as PagedEnvelope<OrderDto>;
      expect(body.meta.pagination.limit).toBe(1);
      expect(body.meta.pagination.hasMore).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toMatch(/^ord_/);
    });

    it('requires authentication for order reads (401)', async () => {
      await get(`/orders/${order1Id}`).expect(401);
    });

    it('hides other shoppers’ orders (404)', async () => {
      const res = await get(`/orders/${order1Id}`, tokenB).expect(404);
      expect((res.body as ErrorEnvelope).error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('answers 404 for malformed and unknown order ids', async () => {
      await get('/orders/not-an-id', tokenA).expect(404);
      await get(
        '/orders/ord_00000000-0000-4000-8000-000000000000',
        tokenA,
      ).expect(404);
    });

    it('answers 409 STOCK_CHANGED when stock is taken after the cart', async () => {
      await post('/cart', tokenA).expect(200);
      await post('/cart/items', tokenA)
        .send({ variantId: jointSmallVariantId, quantity: 10 })
        .expect(201);

      // Simulate a concurrent reservation that takes all availability.
      const before = await readJointVariant();
      await prisma.productVariant.update({
        where: { id: jointVariantUuid },
        data: { stockReserved: before.stockQuantity },
      });
      try {
        const res = await post('/checkout', tokenA)
          .send({ fulfilmentMethod: 'pickup' })
          .expect(409);
        expect((res.body as ErrorEnvelope).error.code).toBe('STOCK_CHANGED');

        const order = await getOrder(order2Id);
        expect(order.status).toBe('cancelled'); // unchanged by the failed try
      } finally {
        await prisma.productVariant.update({
          where: { id: jointVariantUuid },
          data: { stockReserved: before.stockReserved },
        });
      }
    });
  });
});
