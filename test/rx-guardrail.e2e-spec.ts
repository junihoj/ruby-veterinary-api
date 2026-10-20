import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ErrorEnvelope } from '../src/shared/cross-cutting/envelope';
import { PrefixedId } from '../src/shared/kernel/domain/prefixed-id';
import { signProviderPayload } from '../src/modules/commerce/infrastructure/payment/provider-signature';
import type { AuthTokensDto } from '../src/modules/identity/application/dto/auth-response.dto';
import type { OrderDto } from '../src/modules/commerce/application/dto/commerce.responses.dto';
import type {
  PrescriptionQueueItemDto,
  PrescriptionRequestDetailDto,
  PrescriptionRequestDto,
} from '../src/modules/pharmacy-authorisation/application/dto/pharmacy.responses.dto';
import {
  CATALOG_MANAGER_EMAIL,
  CATALOG_MANAGER_PASSWORD,
  VETERINARIAN_EMAIL,
  VETERINARIAN_PASSWORD,
} from '../prisma/seed-credentials';

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
 * NAMED CRITICAL PATH — Pharmacy guardrail e2e (M5, Flow 4): the full Rx
 * order lifecycle through the production factory: pet rules at cart time,
 * the checkout hold with PRIMARY_VET_REQUIRED compensation, the rx:review
 * queue, the PRESCRIBER_REQUIRED decision split, one-transaction decisions
 * with the append-only audit trail (database trigger proof), both
 * payment/approval orderings, and the rejection consequence (cancel +
 * release + refund). Requires DATABASE_URL → ruby_veterinary_test,
 * migrated and seeded.
 *
 * Mutates SKU-ABX-100 stock only, via delta assertions; the seeder
 * re-baselines on the next run.
 */
jest.setTimeout(120_000);

describe('Pharmacy guardrail — prescription flow (e2e, M5 critical path)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000)}`;
  /** Digits-only form of runId: phone numbers must be pure E.164. */
  const runDigits = runId.replace(/\D/g, '');

  // Owner A: own pet WITH a current primary vet (Dr Ada).
  let tokenA = '';
  const emailA = `rx-owner-a-${runId}@example.com`;
  // Owner B: own pet WITHOUT a primary vet (the 422 path).
  let tokenB = '';
  const emailB = `rx-owner-b-${runId}@example.com`;
  const ownerPassword = 'owner-password-123';

  // Staff: the seeded veterinarian (the only decider) and the seeded
  // practice_manager (rx:review reader, never a decider).
  let vetToken = '';
  let managerToken = '';

  let clientAId = '';
  let petAId = '';
  let clientBId = '';
  let petBId = '';
  let vetUserId = '';

  // Seeded Rx fixture.
  let rxVariantId = '';
  let rxVariantUuid = '';

  // Flow state.
  let order1Id = '';
  let order1PaymentRef = '';
  let request1Id = '';
  let order2Id = '';
  let order2PaymentRef = '';
  let request2Id = '';
  let orderBId = '';
  const stockBaseline = { stockQuantity: 0, stockReserved: 0 };

  const server = () => request(app.getHttpServer());
  const auth = (token?: string) =>
    token ? { Authorization: `Bearer ${token}` } : {};
  const get = (path: string, token?: string) =>
    server().get(`/api/v1${path}`).set(auth(token));
  const post = (path: string, token?: string) =>
    server().post(`/api/v1${path}`).set(auth(token));

  const postWebhook = (payload: unknown) => {
    const raw = JSON.stringify(payload);
    const body = Buffer.from(raw, 'utf8');
    return server()
      .post('/api/v1/webhooks/payments')
      .set('Content-Type', 'application/json')
      .set(
        'X-Provider-Signature',
        signProviderPayload(
          body,
          process.env.PAYMENT_WEBHOOK_SECRET ??
            'dev-payment-webhook-secret-change-me',
        ),
      )
      .send(raw);
  };

  const capture = (eventId: string, paymentRef: string, orderRef: string) =>
    postWebhook({
      id: eventId,
      type: 'payment_intent.succeeded',
      data: { payment_ref: paymentRef, order_ref: orderRef },
    }).expect(200);

  const registerOwner = async (email: string): Promise<string> => {
    await post('/auth/register')
      .send({ email, password: ownerPassword })
      .expect(201);
    const login = await post('/auth/login')
      .send({ email, password: ownerPassword })
      .expect(200);
    return (login.body as Envelope<AuthTokensDto>).data.tokens.accessToken;
  };

  const addRxLine = (token: string, petId: string | null) =>
    post('/cart/items', token).send({
      variantId: rxVariantId,
      quantity: 1,
      ...(petId ? { petId } : {}),
    });

  const checkoutBody = {
    fulfilmentMethod: 'ship',
    shippingAddress: {
      line1: '1 Ruby Lane',
      city: 'London',
      postalCode: 'SW1A 1AA',
      country: 'GB',
    },
    paymentMethodToken: 'pm_mock_default',
  };

  const getOrder = async (orderId: string, token = tokenA) => {
    const res = await get(`/orders/${orderId}`, token).expect(200);
    return (res.body as Envelope<OrderDto>).data;
  };

  /**
   * The commerce consumers run on the in-process event bus, which the
   * pharmacy publishes to after its transaction commits and without the
   * handler awaiting delivery. Poll the database so the assertion observes
   * the committed side effect rather than racing the consumer.
   */
  const eventually = async <T>(
    probe: () => Promise<T | null>,
    message: string,
  ): Promise<T> => {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const value = await probe();
      if (value !== null) return value;
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for ${message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };

  const paymentOf = (orderId: string) =>
    prisma.payment.findFirstOrThrow({
      where: { orderId },
      orderBy: { id: 'asc' },
    });

  /** Waits for the PrescriptionRejected consumer to cancel the held order. */
  const waitCancelled = (orderId: string) =>
    eventually(async () => {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      return order?.status === 'cancelled' ? order : null;
    }, `order ${orderId} to be cancelled`);

  /** Waits for the refund that rides along with the cancellation. */
  const waitRefunded = (orderId: string) =>
    eventually(async () => {
      const payment = await prisma.payment.findFirst({
        where: { orderId, status: 'refunded' },
        select: { id: true },
      });
      return payment;
    }, `order ${orderId} payment to be refunded`);

  const requestRow = (orderId: string) =>
    prisma.prescriptionRequest.findFirstOrThrow({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

  beforeAll(async () => {
    app = (await createApp()) as INestApplication<App>;
    prisma = app.get(PrismaService);

    const rx = await prisma.productVariant.findUnique({
      where: { sku: 'SKU-ABX-100' },
    });
    if (!rx) {
      throw new Error(
        'Seed fixture SKU-ABX-100 missing — run `pnpm db:seed` first.',
      );
    }
    rxVariantId = PrefixedId.format('variant', rx.id);
    rxVariantUuid = rx.id;

    const ada = await prisma.user.findUniqueOrThrow({
      where: { email: VETERINARIAN_EMAIL },
      select: { id: true },
    });
    vetUserId = ada.id;

    tokenA = await registerOwner(emailA);
    tokenB = await registerOwner(emailB);

    const vetLogin = await post('/auth/login')
      .send({ email: VETERINARIAN_EMAIL, password: VETERINARIAN_PASSWORD })
      .expect(200);
    vetToken = (vetLogin.body as Envelope<AuthTokensDto>).data.tokens
      .accessToken;

    const managerLogin = await post('/auth/login')
      .send({
        email: CATALOG_MANAGER_EMAIL,
        password: CATALOG_MANAGER_PASSWORD,
      })
      .expect(200);
    managerToken = (managerLogin.body as Envelope<AuthTokensDto>).data.tokens
      .accessToken;

    // Staff-side records: client + pet per owner, primary vet only for A.
    const ownerA = await prisma.user.findUniqueOrThrow({
      where: { email: emailA },
      select: { id: true },
    });
    const ownerB = await prisma.user.findUniqueOrThrow({
      where: { email: emailB },
      select: { id: true },
    });

    const clientA = await post('/admin/clients', managerToken)
      .send({
        displayName: `Rex Owner ${runId}`,
        phone: `+442079${runDigits.slice(-6)}`,
        userId: PrefixedId.format('user', ownerA.id),
        source: 'walk_in',
      })
      .expect(201);
    clientAId = (clientA.body as Envelope<{ id: string }>).data.id;
    const petA = await post(`/admin/clients/${clientAId}/pets`, managerToken)
      .send({ name: 'Rex', species: 'dog' })
      .expect(201);
    petAId = (petA.body as Envelope<{ id: string }>).data.id;
    await post(`/admin/pets/${petAId}/primary-vet`, vetToken)
      .send({ veterinarianUserId: PrefixedId.format('user', vetUserId) })
      .expect(200);

    const clientB = await post('/admin/clients', managerToken)
      .send({
        displayName: `Rowan Owner ${runId}`,
        phone: `+44208${runDigits.slice(-7)}`,
        userId: PrefixedId.format('user', ownerB.id),
        source: 'walk_in',
      })
      .expect(201);
    clientBId = (clientB.body as Envelope<{ id: string }>).data.id;
    const petB = await post(`/admin/clients/${clientBId}/pets`, managerToken)
      .send({ name: 'Rowan', species: 'cat' })
      .expect(201);
    petBId = (petB.body as Envelope<{ id: string }>).data.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('cart rules: the pet is fixed at add-to-cart', () => {
    it('answers 400 VALIDATION_FAILED when no pet is named', async () => {
      const res = await addRxLine(tokenA, null).expect(400);
      expect((res.body as ErrorEnvelope).error.code).toBe('VALIDATION_FAILED');
    });

    it('answers 404 when the pet belongs to another owner', async () => {
      const res = await addRxLine(tokenA, petBId).expect(404);
      expect((res.body as ErrorEnvelope).error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('accepts the owner’s own pet', async () => {
      const res = await addRxLine(tokenA, petAId).expect(201);
      const line = (
        res.body as Envelope<{ requiresPrescription: boolean; petId: string }>
      ).data;
      expect(line.requiresPrescription).toBe(true);
      expect(line.petId).toBe(petAId);
    });
  });

  describe('checkout: the pharmacy hold engages (Flow 4)', () => {
    it('creates an awaiting_prescription order with a pending request', async () => {
      const before = await prisma.productVariant.findUniqueOrThrow({
        where: { id: rxVariantUuid },
      });
      stockBaseline.stockQuantity = before.stockQuantity;
      stockBaseline.stockReserved = before.stockReserved;

      const res = await post('/checkout', tokenA)
        .send(checkoutBody)
        .expect(201);
      const order = (res.body as Envelope<OrderDto>).data;
      expect(order.status).toBe('awaiting_prescription');
      expect(order.prescriptionStatus).toBe('pending');
      order1Id = PrefixedId.tryAnyToUuid(order.id) as string;
      expect(order1Id).toBeTruthy();

      const payment = await paymentOf(order1Id);
      order1PaymentRef = payment.gatewayPaymentRef;
      expect(payment.status).toBe('pending');

      const after = await prisma.productVariant.findUniqueOrThrow({
        where: { id: rxVariantUuid },
      });
      expect(after.stockReserved).toBe(stockBaseline.stockReserved + 1);

      const request = await requestRow(order1Id);
      request1Id = request.id;
      expect(request.status).toBe('pending');
      expect(request.petId).toBe(PrefixedId.tryAnyToUuid(petAId));
      expect(request.veterinarianUserId).toBe(vetUserId);
      expect(request.orderItemIds).toHaveLength(1);
    });

    it('fills prescriptionStatus on the order read', async () => {
      const order = await getOrder(order1Id);
      expect(order.status).toBe('awaiting_prescription');
      expect(order.prescriptionStatus).toBe('pending');
    });
  });

  describe('a pet without a current primary vet: 422 + compensating revert', () => {
    it('answers 422 PRIMARY_VET_REQUIRED and leaves no held order behind', async () => {
      await addRxLine(tokenB, petBId).expect(201);

      const before = await prisma.productVariant.findUniqueOrThrow({
        where: { id: rxVariantUuid },
      });

      const res = await post('/checkout', tokenB)
        .send(checkoutBody)
        .expect(422);
      expect((res.body as ErrorEnvelope).error.code).toBe(
        'PRIMARY_VET_REQUIRED',
      );

      // The created order was cancelled and its reservation released; the
      // pending intent failed — nothing stays awaiting or holds stock.
      const ownerB = await prisma.user.findUniqueOrThrow({
        where: { email: emailB },
        select: { id: true },
      });
      const orders = await prisma.order.findMany({
        where: { userId: ownerB.id },
      });
      expect(orders.length).toBeGreaterThan(0);
      for (const order of orders) {
        expect(order.status).toBe('cancelled');
      }
      orderBId = orders[0].id;
      const failedPayment = await paymentOf(orderBId);
      expect(failedPayment.status).toBe('failed');
      expect(failedPayment.failureCode).toBe('rx_hold_failed');

      const after = await prisma.productVariant.findUniqueOrThrow({
        where: { id: rxVariantUuid },
      });
      expect(after.stockReserved).toBe(before.stockReserved);

      // No request may stand for the cancelled order.
      const requests = await prisma.prescriptionRequest.count({
        where: { orderId: orderBId },
      });
      expect(requests).toBe(0);
    });
  });

  describe('review queue: rx:review reads, clients never', () => {
    it('answers 403 STAFF_ONLY for an owner', async () => {
      const res = await get('/prescriptions/queue', tokenA).expect(403);
      expect((res.body as ErrorEnvelope).error.code).toBe('STAFF_ONLY');
    });

    it('shows the pending request with pet and client context', async () => {
      const res = await get('/prescriptions/queue', managerToken).expect(200);
      const items = (res.body as PagedEnvelope<PrescriptionQueueItemDto>).data;
      const item = items.find((i) => i.id === `rx_${request1Id}`);
      expect(item).toBeDefined();
      expect(item?.status).toBe('pending');
      expect(item?.petName).toBe('Rex');
      expect(item?.clientName).toContain(runId);
    });

    it('opens the detail with an empty decision list and patient context', async () => {
      const res = await get(
        `/prescriptions/rx_${request1Id}`,
        managerToken,
      ).expect(200);
      const detail = (res.body as Envelope<PrescriptionRequestDetailDto>).data;
      expect(detail.pet).toEqual({ id: petAId, name: 'Rex' });
      expect(detail.client?.displayName).toContain(runId);
      expect(detail.decisions).toEqual([]);
      expect(detail.veterinarianUserId).toBe(
        PrefixedId.format('user', vetUserId),
      );
    });
  });

  describe('decisions are veterinarian-only (PRESCRIBER_REQUIRED)', () => {
    it('answers 403 for a practice_manager on approve and reject', async () => {
      const approve = await post(
        `/prescriptions/rx_${request1Id}/approve`,
        managerToken,
      )
        .send({})
        .expect(403);
      expect((approve.body as ErrorEnvelope).error.code).toBe(
        'PRESCRIBER_REQUIRED',
      );

      const reject = await post(
        `/prescriptions/rx_${request1Id}/reject`,
        managerToken,
      )
        .send({ reasonText: 'not on my watch' })
        .expect(403);
      expect((reject.body as ErrorEnvelope).error.code).toBe(
        'PRESCRIBER_REQUIRED',
      );

      // Nothing was decided.
      const request = await requestRow(order1Id);
      expect(request.status).toBe('pending');
      const decisions = await prisma.prescriptionDecision.count({
        where: { prescriptionRequestId: request1Id },
      });
      expect(decisions).toBe(0);
    });
  });

  describe('veterinarian flow: query → approve, append-only (ADR-0012)', () => {
    const approveKey = `rx-guardrail-approve-${runId}`;

    it('answers 400 VALIDATION_FAILED when a rejection lacks its reason', async () => {
      const res = await post(`/prescriptions/rx_${request1Id}/reject`, vetToken)
        .send({})
        .expect(400);
      expect((res.body as ErrorEnvelope).error.code).toBe('VALIDATION_FAILED');
    });

    it('opens a query round and refuses to query twice', async () => {
      const queried = await post(
        `/prescriptions/rx_${request1Id}/query`,
        vetToken,
      )
        .send({ reasonText: 'Which formulation did the vet prescribe?' })
        .expect(200);
      expect(
        (queried.body as Envelope<PrescriptionRequestDto>).data.status,
      ).toBe('queried');

      const again = await post(
        `/prescriptions/rx_${request1Id}/query`,
        vetToken,
      )
        .send({ reasonText: 'again?' })
        .expect(409);
      expect((again.body as ErrorEnvelope).error.code).toBe('STATE_CONFLICT');
    });

    it('approves with idempotent replay semantics', async () => {
      const approved = await post(
        `/prescriptions/rx_${request1Id}/approve`,
        vetToken,
      )
        .set('Idempotency-Key', approveKey)
        .send({ note: 'Approved after review.' })
        .expect(200);
      const body = approved.body as Envelope<PrescriptionRequestDto>;
      expect(body.data.status).toBe('approved');
      expect(body.data.decidedBy).toBe(PrefixedId.format('user', vetUserId));

      // Same key, same body: the original response replays (the handler is
      // not re-run — this is the same order, not a second one). Only `data`
      // is compared: `meta.timestamp` is minted per request.
      const replay = await post(
        `/prescriptions/rx_${request1Id}/approve`,
        vetToken,
      )
        .set('Idempotency-Key', approveKey)
        .send({ note: 'Approved after review.' })
        .expect(200);
      expect((replay.body as Envelope<PrescriptionRequestDto>).data).toEqual(
        body.data,
      );

      // Same key, different body: 409 IDEMPOTENCY_CONFLICT.
      const conflict = await post(
        `/prescriptions/rx_${request1Id}/approve`,
        vetToken,
      )
        .set('Idempotency-Key', approveKey)
        .send({ note: 'Something else.' })
        .expect(409);
      expect((conflict.body as ErrorEnvelope).error.code).toBe(
        'IDEMPOTENCY_CONFLICT',
      );

      // A terminal request never reopens (no key — straight to the guard).
      const decided = await post(
        `/prescriptions/rx_${request1Id}/approve`,
        vetToken,
      )
        .send({})
        .expect(409);
      expect((decided.body as ErrorEnvelope).error.code).toBe('STATE_CONFLICT');
    });

    it('wrote decision + audit + snapshot rows', async () => {
      const decisions = await prisma.prescriptionDecision.findMany({
        where: { prescriptionRequestId: request1Id },
        orderBy: { decidedAt: 'asc' },
      });
      expect(decisions.map((d) => d.decision)).toEqual(['query', 'approve']);
      expect(decisions.every((d) => d.decidedBy === vetUserId)).toBe(true);

      const audit = await prisma.rxAuditLog.findMany({
        where: { prescriptionRequestId: request1Id },
      });
      const actions = audit.map((row) => row.action);
      expect(actions).toContain('viewed'); // the detail view is logged
      expect(
        audit.filter((row) => row.action === 'decision_recorded').length,
      ).toBeGreaterThanOrEqual(2);

      const snapshots = await prisma.patientAssociation.count({
        where: { prescriptionRequestId: request1Id },
      });
      expect(snapshots).toBeGreaterThanOrEqual(1);
    });

    it('the database refuses UPDATE and DELETE on the append-only tables', async () => {
      // The append-only tables carry trigger guards (ADR-0012): UPDATE and
      // DELETE are refused by the database, not by application code.
      await expect(
        prisma.$executeRaw`
          UPDATE pharmacy.prescription_decisions
             SET decision = 'approve'
           WHERE id = (SELECT id FROM pharmacy.prescription_decisions
                        WHERE prescription_request_id = ${request1Id}::uuid LIMIT 1)`,
      ).rejects.toThrow();
      await expect(
        prisma.$executeRaw`
          DELETE FROM pharmacy.rx_audit_log
           WHERE prescription_request_id = ${request1Id}::uuid`,
      ).rejects.toThrow();
    });
  });

  describe('approval releases the held order once the money is in', () => {
    it('capture after approval flips the order to paid', async () => {
      await capture(`evt_${runId}-capture-a`, order1PaymentRef, order1Id);

      const order = await getOrder(order1Id);
      expect(order.status).toBe('paid');
      expect(order.payment?.status).toBe('captured');
      expect(order.prescriptionStatus).toBe('approved');
    });
  });

  describe('rejection: cancel + release + refund (capture before decision)', () => {
    it('a captured payment never sneaks past an open hold', async () => {
      // Second Rx order from owner A (cart was converted at checkout).
      await addRxLine(tokenA, petAId).expect(201);
      const res = await post('/checkout', tokenA)
        .send(checkoutBody)
        .expect(201);
      const order = (res.body as Envelope<OrderDto>).data;
      expect(order.status).toBe('awaiting_prescription');
      order2Id = PrefixedId.tryAnyToUuid(order.id) as string;
      const payment = await paymentOf(order2Id);
      order2PaymentRef = payment.gatewayPaymentRef;
      const request2 = await requestRow(order2Id);
      request2Id = request2.id;
      expect(request2.status).toBe('pending');

      // Money arrives while the hold is open: capture + settle, no release.
      await capture(`evt_${runId}-capture-b`, order2PaymentRef, order2Id);
      const held = await getOrder(order2Id);
      expect(held.status).toBe('awaiting_prescription');
      expect(held.payment?.status).toBe('captured');
      expect(held.prescriptionStatus).toBe('pending');
    });

    it('rejecting cancels the order, releases the hold, refunds the money', async () => {
      const rejected = await post(
        `/prescriptions/rx_${request2Id}/reject`,
        vetToken,
      )
        .send({ reasonCode: 'wrong_dose', reasonText: 'Dose too high.' })
        .expect(200);
      expect(
        (rejected.body as Envelope<PrescriptionRequestDto>).data.status,
      ).toBe('rejected');

      await waitCancelled(order2Id);
      await waitRefunded(order2Id);

      const order = await getOrder(order2Id);
      expect(order.status).toBe('cancelled');
      expect(order.payment?.status).toBe('refunded');
      expect(order.prescriptionStatus).toBe('rejected');

      // No reservation lingers on the shared Rx variant. Both releases land
      // on the same variant through separate consumers, so wait for the
      // count rather than assuming both have committed.
      await eventually(async () => {
        const variant = await prisma.productVariant.findUniqueOrThrow({
          where: { id: rxVariantUuid },
          select: { stockReserved: true },
        });
        return variant.stockReserved === 0 ? variant : null;
      }, 'the shared Rx variant reservation to drop to zero');
    });
  });

  describe('missing requests answer 404 everywhere', () => {
    const unknown = 'rx_00000000-0000-4000-8000-000000000000';

    it('404s detail, approve, reject, and malformed ids', async () => {
      await get(`/prescriptions/${unknown}`, vetToken).expect(404);
      await post(`/prescriptions/${unknown}/approve`, vetToken)
        .send({})
        .expect(404);
      await post('/prescriptions/rx_not-a-uuid/reject', vetToken)
        .send({ reasonText: 'x' })
        .expect(404);
    });
  });
});
