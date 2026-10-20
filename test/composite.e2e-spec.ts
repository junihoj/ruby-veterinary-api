import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ErrorEnvelope } from '../src/shared/cross-cutting/envelope';
import { PrefixedId } from '../src/shared/kernel/domain/prefixed-id';
import type { AuthTokensDto } from '../src/modules/identity/application/dto/auth-response.dto';
import { SubscriptionTickService } from '../src/modules/commerce/infrastructure/subscription-tick.service';
import { signProviderPayload } from '../src/modules/commerce/infrastructure/payment/provider-signature';
import type {
  CartDto,
  CartItemDto,
  DownloadFileGrantDto,
  DownloadUrlDto,
  OrderDto,
  ProductDetailDto,
  QuoteDto,
  SubscriptionDto,
} from '../src/modules/commerce/application/dto/commerce.responses.dto';
import {
  CATALOG_MANAGER_EMAIL,
  CATALOG_MANAGER_PASSWORD,
} from '../prisma/seed-credentials';

/** Response envelopes typed at the assertion sites (supertest body is any). */
interface Envelope<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}

/**
 * Commerce M3b e2e: composite cart lines (both pricing modes), component
 * stock through checkout → capture, digital purchases (auto-completing
 * fulfilment + download grants + signed URL issuance), and subscription
 * auto-refill (CRUD + the timer driven directly — SUBSCRIPTIONS_TICK_MS=0
 * pins the interval off in e2e, so tickOnce() is called by hand).
 *
 * Requires DATABASE_URL → ruby_veterinary_test, migrated and seeded
 * (`pnpm db:seed`). Stock assertions are relative (baseline reads around
 * each checkout) and the suite only touches SKU-WCH-100, SKU-VID-001,
 * SKU-WELL-BOX, and SKU-ABX-100 — never SKU-JCC-S / SKU-GUIDE-PUP, whose
 * sibling suites run in parallel workers.
 */
// The commerce app bootstrap (Swagger scan over 8 controllers) exceeds
// Jest's 5s default hook timeout under parallel workers.
jest.setTimeout(120_000);

describe('Commerce composite, downloads & subscriptions (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000)}`;
  const shopperEmail = `m3b-a-${runId}@example.com`;
  const strangerEmail = `m3b-b-${runId}@example.com`;
  const shopperPassword = 'm3b-password-123';

  let tokenA = '';
  let tokenB = '';
  let adminToken = '';

  // Seeded fixtures resolved in beforeAll (fail fast when unseeded).
  let wellBoxVariantId = ''; // SKU-WELL-BOX — fixed-price carrier
  let wellBoxVariantUuid = '';
  let chewVariantId = ''; // SKU-WCH-100 — box component stock
  let chewVariantUuid = '';
  let chewProductId = '';
  let videoVariantId = ''; // SKU-VID-001 — virtual + downloadable
  let videoVariantUuid = '';
  let videoProductId = '';
  let rxVariantId = ''; // SKU-ABX-100 — Rx option (tick pause test)
  let rxProductId = '';
  let guideVariantId = ''; // SKU-GUIDE-PUP — unpinned guide option (cart-only)
  let boxProductId = ''; // wellness-box product
  let kitProductId = ''; // pet-care-kit product

  // Slot/option ids resolved from the seeded PDPs in beforeAll.
  let boxChewSlotId = '';
  let boxChewOptionVariantId = '';
  let boxGuideSlotId = '';
  let boxGuideProductId = '';
  let kitSlotId = '';
  let kitVideoOptionProductId = '';
  let kitRxOptionVariantId = '';

  const server = () => request(app.getHttpServer());
  const auth = (token?: string) =>
    token ? { Authorization: `Bearer ${token}` } : {};
  const get = (path: string, token?: string) =>
    server().get(`/api/v1${path}`).set(auth(token));
  const post = (path: string, token?: string) =>
    server().post(`/api/v1${path}`).set(auth(token));
  const patch = (path: string, token?: string) =>
    server().patch(`/api/v1${path}`).set(auth(token));
  const del = (path: string, token?: string) =>
    server().delete(`/api/v1${path}`).set(auth(token));

  /** Signs the exact raw body the webhook controller will hash. */
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

  const capture = async (order: OrderDto) => {
    const res = await postWebhook({
      id: `evt_${runId}-capture-${order.id}`,
      type: 'payment_intent.succeeded',
      data: {
        payment_ref: order.payment?.gatewayPaymentRef,
        order_ref: order.id,
      },
    }).expect(200);
    expect((res.body as Envelope<{ received: boolean }>).data.received).toBe(
      true,
    );
  };

  const getOrder = async (orderId: string, token = tokenA) => {
    const res = await get(`/orders/${orderId}`, token).expect(200);
    return (res.body as Envelope<OrderDto>).data;
  };

  const readVariant = (uuid: string) =>
    prisma.productVariant.findUniqueOrThrow({ where: { id: uuid } });

  beforeAll(async () => {
    app = (await createApp()) as INestApplication<App>;
    prisma = app.get(PrismaService);

    // Residual subscriptions from earlier gate runs would be ordered (or
    // paused) by the tick tests below — cancel them so every tick is
    // deterministic within this suite.
    await prisma.subscription.updateMany({
      where: { status: { not: 'cancelled' } },
      data: { status: 'cancelled', cancelReason: 'e2e reset' },
    });

    const [wellBox, chew, video, rx, guide] = await Promise.all([
      prisma.productVariant.findUnique({ where: { sku: 'SKU-WELL-BOX' } }),
      prisma.productVariant.findUnique({ where: { sku: 'SKU-WCH-100' } }),
      prisma.productVariant.findUnique({ where: { sku: 'SKU-VID-001' } }),
      prisma.productVariant.findUnique({ where: { sku: 'SKU-ABX-100' } }),
      prisma.productVariant.findUnique({ where: { sku: 'SKU-GUIDE-PUP' } }),
    ]);
    if (!wellBox || !chew || !video || !rx || !guide) {
      throw new Error(
        'Seed fixtures missing — run `pnpm db:seed` against the test DB first.',
      );
    }
    wellBoxVariantId = PrefixedId.format('variant', wellBox.id);
    wellBoxVariantUuid = wellBox.id;
    boxProductId = PrefixedId.format('product', wellBox.productId);
    chewVariantId = PrefixedId.format('variant', chew.id);
    chewVariantUuid = chew.id;
    chewProductId = PrefixedId.format('product', chew.productId);
    videoVariantId = PrefixedId.format('variant', video.id);
    videoVariantUuid = video.id;
    videoProductId = PrefixedId.format('product', video.productId);
    rxVariantId = PrefixedId.format('variant', rx.id);
    rxProductId = PrefixedId.format('product', rx.productId);
    // The box's guide option is unpinned: any active variant of the guide
    // product matches. Cart-level tests use it; nothing is ever checked out
    // with it, so SKU-GUIDE-PUP stock is never reserved here.
    guideVariantId = PrefixedId.format('variant', guide.id);

    // Slot/option ids from the seeded PDPs (the contract's client view).
    const boxPdp = (await get('/products/wellness-box').expect(200))
      .body as Envelope<ProductDetailDto>;
    const boxSlots = boxPdp.data.slots;
    boxChewSlotId = boxSlots.find((s) => s.name === 'Choose your chew')!.id;
    boxGuideSlotId = boxSlots.find((s) => s.name === 'Add a care guide')!.id;
    boxChewOptionVariantId = boxSlots[0].options[0].variantId as string;
    boxGuideProductId = boxSlots[1].options[0].productId;

    const kitPdp = (await get('/products/pet-care-kit').expect(200))
      .body as Envelope<ProductDetailDto>;
    kitProductId = kitPdp.data.id; // pet-care-kit product (sum-composite)
    const kitSlot = kitPdp.data.slots[0];
    kitSlotId = kitSlot.id;
    kitVideoOptionProductId = kitSlot.options.find(
      (o) => o.slug === 'care-video-pack',
    )!.productId;
    kitRxOptionVariantId = kitSlot.options.find((o) => o.variantId !== null)!
      .variantId as string;

    // Two shoppers (A buys, B proves owner scoping) + one staff admin.
    for (const [email, set] of [
      [shopperEmail, (t: string) => (tokenA = t)],
      [strangerEmail, (t: string) => (tokenB = t)],
    ] as const) {
      await post('/auth/register')
        .send({ email, password: shopperPassword })
        .expect(201);
      const login = await post('/auth/login')
        .send({ email, password: shopperPassword })
        .expect(200);
      set((login.body as Envelope<AuthTokensDto>).data.tokens.accessToken);
    }
    const adminLogin = await post('/auth/login')
      .send({
        email: CATALOG_MANAGER_EMAIL,
        password: CATALOG_MANAGER_PASSWORD,
      })
      .expect(200);
    adminToken = (adminLogin.body as Envelope<AuthTokensDto>).data.tokens
      .accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('composite cart lines', () => {
    it('adds a fixed composite priced by its default variant', async () => {
      const res = await post('/cart/items', tokenA)
        .send({
          variantId: wellBoxVariantId,
          quantity: 1,
          components: [
            {
              slotId: boxChewSlotId,
              productId: chewProductId,
              variantId: boxChewOptionVariantId,
              quantity: 1,
            },
          ],
        })
        .expect(201);

      const line = (res.body as Envelope<CartItemDto>).data;
      expect(line.variantId).toBe(wellBoxVariantId);
      // Fixed mode: the £27 box price wins, components only drive the pick
      // list and stock.
      expect(line.unitPrice).toBe('27.00');
      expect(line.components).toEqual([
        {
          slotId: boxChewSlotId,
          productId: chewProductId,
          variantId: boxChewOptionVariantId,
          quantity: 1,
        },
      ]);
    });

    it('merges quantity and replaces components on re-add', async () => {
      // Same product + variant + pet: the line merges. The box now also
      // carries the optional guide (unpinned option, £3 override) — the
      // fixed £27 price is unchanged, components only drive the pick list.
      const res = await post('/cart/items', tokenA)
        .send({
          variantId: wellBoxVariantId,
          quantity: 2,
          components: [
            {
              slotId: boxChewSlotId,
              productId: chewProductId,
              variantId: boxChewOptionVariantId,
              quantity: 1,
            },
            {
              slotId: boxGuideSlotId,
              productId: boxGuideProductId,
              variantId: guideVariantId,
              quantity: 1,
            },
          ],
        })
        .expect(201);

      const line = (res.body as Envelope<CartItemDto>).data;
      expect(line.quantity).toBe(3); // 1 (initial) + 2 (this add)
      expect(line.unitPrice).toBe('27.00');
      expect(line.components).toHaveLength(2);
      expect(line.lineTotal).toBe('81.00'); // 3 × 27.00
    });

    it('answers 400 for an option that is not configured in the slot', async () => {
      const res = await post('/cart/items', tokenA)
        .send({
          variantId: wellBoxVariantId,
          quantity: 1,
          components: [
            {
              slotId: boxChewSlotId,
              productId: chewProductId,
              variantId: boxChewOptionVariantId,
              quantity: 1,
            },
            {
              // The video pack is not an option of the box's guide slot.
              slotId: boxGuideSlotId,
              productId: videoProductId,
              variantId: videoVariantId,
              quantity: 1,
            },
          ],
        })
        .expect(400);
      expect((res.body as ErrorEnvelope).error.code).toBe('VALIDATION_FAILED');
    });

    it('answers 400 for a per-slot minimum violation', async () => {
      // The chew slot is minSelect 1 — a box without it cannot be added.
      const res = await post('/cart/items', tokenA)
        .send({
          variantId: wellBoxVariantId,
          quantity: 1,
          components: [
            {
              slotId: boxGuideSlotId,
              productId: boxGuideProductId,
              variantId: guideVariantId, // unpinned option: any guide variant
              quantity: 1,
            },
          ],
        })
        .expect(400);
      expect((res.body as ErrorEnvelope).error.code).toBe('VALIDATION_FAILED');
    });

    it('prices a sum composite as the total of its selections', async () => {
      const res = await post('/cart/items', tokenA)
        .send({
          quantity: 1,
          components: [
            {
              slotId: kitSlotId,
              productId: kitVideoOptionProductId,
              variantId: videoVariantId,
              quantity: 1,
            },
          ],
        })
        .expect(201);

      const line = (res.body as Envelope<CartItemDto>).data;
      // Sum mode: the line never carries a variant; the video's £5 is the
      // line's unit price.
      expect(line.variantId).toBeNull();
      expect(line.productId).toBe(kitProductId);
      expect(line.unitPrice).toBe('5.00');
    });

    it('answers 400 when a prescription option is selected without its pet (M5)', async () => {
      // M3b's derived Rx flag still engages — now as the pet requirement:
      // an Rx composite line must name its pet (400), never a silent add.
      const res = await post('/cart/items', tokenA)
        .send({
          quantity: 1,
          components: [
            {
              slotId: kitSlotId,
              productId: kitVideoOptionProductId,
              variantId: videoVariantId,
              quantity: 1,
            },
            {
              // The pinned antibiotic option trips the derived Rx flag.
              slotId: kitSlotId,
              productId: rxProductId,
              variantId: kitRxOptionVariantId,
              quantity: 1,
            },
          ],
        })
        .expect(400);
      expect((res.body as ErrorEnvelope).error.code).toBe('VALIDATION_FAILED');
    });

    it('answers 409 when a component cannot cover the line quantity', async () => {
      // One more unit than the chew variant has available (advisory check
      // at add time) — read the live figure so the test is residue-proof.
      const chew = await readVariant(chewVariantUuid);
      const unavailable = chew.stockQuantity - chew.stockReserved + 1;
      const res = await post('/cart/items', tokenA)
        .send({
          variantId: wellBoxVariantId,
          quantity: 1,
          components: [
            {
              slotId: boxChewSlotId,
              productId: chewProductId,
              variantId: boxChewOptionVariantId,
              quantity: unavailable,
            },
          ],
        })
        .expect(409);
      expect((res.body as ErrorEnvelope).error.code).toBe('STOCK_CHANGED');
    });
  });

  describe('composite checkout & capture', () => {
    let checkoutOrderId = '';
    let chewBaseline = { stockQuantity: 0, stockReserved: 0 };
    let videoBaseline = { stockQuantity: 0, stockReserved: 0 };

    it('quotes VAT + flat shipping across both composite modes', async () => {
      await del('/cart', tokenA).expect(204);
      // Fixed box (£27) with the chew selection.
      await post('/cart/items', tokenA)
        .send({
          variantId: wellBoxVariantId,
          quantity: 1,
          components: [
            {
              slotId: boxChewSlotId,
              productId: chewProductId,
              variantId: boxChewOptionVariantId,
              quantity: 1,
            },
          ],
        })
        .expect(201);
      // Sum kit (£5 video only).
      await post('/cart/items', tokenA)
        .send({
          quantity: 1,
          components: [
            {
              slotId: kitSlotId,
              productId: kitVideoOptionProductId,
              variantId: videoVariantId,
              quantity: 1,
            },
          ],
        })
        .expect(201);

      const cart = (await get('/cart', tokenA).expect(200)).body as Envelope<
        Pick<CartDto, 'subtotal'>
      >;
      expect(cart.data.subtotal).toBe('32.00'); // 27.00 + 5.00

      const res = await post('/checkout/quote', tokenA)
        .send({ fulfilmentMethod: 'ship' })
        .expect(200);
      const quote = (res.body as Envelope<QuoteDto>).data;
      expect(quote.subtotal).toBe('32.00');
      expect(quote.taxTotal).toBe('6.40');
      expect(quote.shippingTotal).toBe('4.99');
      expect(quote.grandTotal).toBe('43.39');
    });

    it('rejects digital fulfilment while a physical component is in the cart', async () => {
      // The box's chew component is physical — the derived line flag is
      // not digital, so the whole cart cannot go digital.
      await post('/checkout/quote', tokenA)
        .send({ fulfilmentMethod: 'digital' })
        .expect(400);
    });

    it('reserves component stock — never the fixed-price carrier', async () => {
      chewBaseline = await readVariant(chewVariantUuid);
      videoBaseline = await readVariant(videoVariantUuid);

      const res = await post('/checkout', tokenA)
        .set('Idempotency-Key', `e2e-${runId}-composite`)
        .send({
          fulfilmentMethod: 'ship',
          shippingAddress: {
            line1: '1 Ruby Lane',
            city: 'London',
            postalCode: 'SW1A 1AA',
            country: 'GB',
          },
        })
        .expect(201);
      const order = (res.body as Envelope<OrderDto>).data;
      checkoutOrderId = order.id;
      expect(order.status).toBe('pending_payment');

      const boxItem = order.items.find((i) => i.productId === boxProductId)!;
      const kitItem = order.items.find((i) => i.productId === kitProductId)!;
      expect(boxItem.variantId).toBe(wellBoxVariantId);
      expect(boxItem.unitPrice).toBe('27.00');
      // The pick-list snapshot travels with the order.
      expect(boxItem.components).toEqual([
        {
          slotId: boxChewSlotId,
          productId: chewProductId,
          variantId: boxChewOptionVariantId,
          quantity: 1,
        },
      ]);
      expect(kitItem.variantId).toBeNull();
      expect(kitItem.unitPrice).toBe('5.00');

      // Components reserve; the £27 carrier variant holds no stock.
      const chewAfter = await readVariant(chewVariantUuid);
      expect(chewAfter.stockReserved).toBe(chewBaseline.stockReserved + 1);
      const videoAfter = await readVariant(videoVariantUuid);
      expect(videoAfter.stockReserved).toBe(videoBaseline.stockReserved + 1);
      const carrier = await readVariant(wellBoxVariantUuid);
      expect(carrier.stockReserved).toBe(0);
      expect(carrier.stockQuantity).toBe(0);
    });

    it('settles component stock on capture', async () => {
      const order = await getOrder(checkoutOrderId);
      await capture(order);

      const paid = await getOrder(checkoutOrderId);
      expect(paid.status).toBe('paid');
      expect(paid.payment?.status).toBe('captured');

      const chewAfter = await readVariant(chewVariantUuid);
      expect(chewAfter.stockQuantity).toBe(chewBaseline.stockQuantity - 1);
      expect(chewAfter.stockReserved).toBe(chewBaseline.stockReserved);
      const videoAfter = await readVariant(videoVariantUuid);
      expect(videoAfter.stockQuantity).toBe(videoBaseline.stockQuantity - 1);
      expect(videoAfter.stockReserved).toBe(videoBaseline.stockReserved);
    });
  });

  describe('digital purchases & download grants', () => {
    it('auto-completes a fully digital composite fulfilment', async () => {
      // The kit (video component only) derives as digital: the order's
      // fulfilment completes at capture without shipping.
      await del('/cart', tokenA).expect(204);
      await post('/cart/items', tokenA)
        .send({
          quantity: 1,
          components: [
            {
              slotId: kitSlotId,
              productId: kitVideoOptionProductId,
              variantId: videoVariantId,
              quantity: 1,
            },
          ],
        })
        .expect(201);

      const quote = (
        await post('/checkout/quote', tokenA)
          .send({ fulfilmentMethod: 'digital' })
          .expect(200)
      ).body as Envelope<QuoteDto>;
      expect(quote.data.shippingTotal).toBe('0.00');

      const res = await post('/checkout', tokenA)
        .send({ fulfilmentMethod: 'digital' })
        .expect(201);
      const order = (res.body as Envelope<OrderDto>).data;
      expect(order.fulfilmentMethod).toBe('digital');

      await capture(order);

      const paid = await getOrder(order.id);
      expect(paid.status).toBe('paid');
      expect(paid.fulfilment?.status).toBe('delivered');
      expect(paid.fulfilment?.completedAt).toBeTruthy();
      // Grants cover lines whose own product is downloadable — the kit's
      // product is not, so the digital composite ships no files.
      expect(paid.downloads).toEqual([]);
    });

    it('grants the files of a paid downloadable line', async () => {
      await del('/cart', tokenA).expect(204);
      await post('/cart/items', tokenA)
        .send({ variantId: videoVariantId, quantity: 1 })
        .expect(201);

      const res = await post('/checkout', tokenA)
        .send({ fulfilmentMethod: 'digital' })
        .expect(201);
      const order = (res.body as Envelope<OrderDto>).data;
      await capture(order);

      const paid = await getOrder(order.id);
      expect(paid.downloads).toHaveLength(1);
      expect(paid.downloads[0].id).toMatch(/^dgr_[0-9a-f-]{36}$/);
      expect(paid.downloads[0].downloadsUsed).toBe(0);
      expect(paid.downloads[0].maxDownloads).toBeNull();
      expect(paid.downloads[0].revoked).toBe(false);

      const list = (
        await get(`/orders/${order.id}/downloads`, tokenA).expect(200)
      ).body as Envelope<DownloadFileGrantDto[]>;
      // File-level entries: the video pack carries two files under one grant.
      expect(list.data).toHaveLength(2);
      expect(list.data.map((f) => f.fileName)).toEqual([
        'care-video-part-1.mp4',
        'care-video-part-2.mp4',
      ]);
      expect(list.data[0].grantId).toBe(list.data[1].grantId);
      expect(list.data[0].remainingDownloads).toBeNull();

      // Issuing consumes one download and signs the first file by sort order.
      const url = (
        await post(`/downloads/${list.data[0].grantId}/url`, tokenA).expect(200)
      ).body as Envelope<DownloadUrlDto>;
      expect(url.data.fileName).toBe('care-video-part-1.mp4');
      expect(url.data.url).toBeTruthy();
      expect(url.data.expiresIn).toBeGreaterThan(0);

      const used = (
        await get(`/orders/${order.id}/downloads`, tokenA).expect(200)
      ).body as Envelope<DownloadFileGrantDto[]>;
      expect(used.data[0].downloadsUsed).toBe(1);
    });

    it('answers 404 for unknown and foreign grants', async () => {
      await post(
        '/downloads/dgr_00000000-0000-4000-8000-000000000000/url',
        tokenA,
      ).expect(404);
      // B holds no grants of A's orders (the grant id is re-used from the
      // previous test via a fresh lookup).
      const shopper = await prisma.user.findUniqueOrThrow({
        where: { email: shopperEmail },
      });
      const grants = await prisma.productDownloadGrant.findFirst({
        where: { orderItem: { order: { userId: shopper.id } } },
        orderBy: { createdAt: 'desc' },
      });
      expect(grants).not.toBeNull();
      await post(
        `/downloads/${PrefixedId.format('downloadGrant', grants!.id)}/url`,
        tokenB,
      ).expect(404);
    });

    it('answers 403 DOWNLOAD_NOT_AVAILABLE when revoked, then exhausted', async () => {
      const shopper = await prisma.user.findUniqueOrThrow({
        where: { email: shopperEmail },
      });
      const grant = (await prisma.productDownloadGrant.findFirst({
        where: { orderItem: { order: { userId: shopper.id } } },
        orderBy: { createdAt: 'desc' },
      }))!;
      const grantId = PrefixedId.format('downloadGrant', grant.id);

      await prisma.productDownloadGrant.update({
        where: { id: grant.id },
        data: { revokedAt: new Date() },
      });
      const revoked = await post(`/downloads/${grantId}/url`, tokenA).expect(
        403,
      );
      expect((revoked.body as ErrorEnvelope).error.code).toBe(
        'DOWNLOAD_NOT_AVAILABLE',
      );

      // Un-revoke, but cap the grant at exactly the one download already
      // used — the next issue is exhausted.
      await prisma.productDownloadGrant.update({
        where: { id: grant.id },
        data: { revokedAt: null, maxDownloads: 1 },
      });
      const exhausted = await post(`/downloads/${grantId}/url`, tokenA).expect(
        403,
      );
      expect((exhausted.body as ErrorEnvelope).error.code).toBe(
        'DOWNLOAD_NOT_AVAILABLE',
      );
    });

    it('answers 404 for the downloads of a foreign order', async () => {
      const shopper = await prisma.user.findUniqueOrThrow({
        where: { email: shopperEmail },
      });
      const order = await prisma.order.findFirst({
        where: { userId: shopper.id, fulfilmentMethod: 'digital' },
        orderBy: { placedAt: 'desc' },
      });
      expect(order).not.toBeNull();
      await get(
        `/orders/${PrefixedId.format('order', order!.id)}/downloads`,
        tokenB,
      ).expect(404);
    });
  });

  describe('subscriptions', () => {
    it('answers 422 for non-subscribable variants', async () => {
      for (const variantId of [
        videoVariantId, // virtual + downloadable
        wellBoxVariantId, // composite product
        'var_00000000-0000-4000-8000-000000000000', // unknown variant
      ]) {
        const res = await post('/subscriptions', tokenA)
          .send({ variantId, frequency: 'monthly' })
          .expect(422);
        expect((res.body as ErrorEnvelope).error.code).toBe(
          'SUBSCRIPTION_NOT_AVAILABLE',
        );
      }
    });

    it('answers 400 for an unknown frequency', async () => {
      const res = await post('/subscriptions', tokenA)
        .send({ variantId: chewVariantId, frequency: 'weekly' })
        .expect(400);
      expect((res.body as ErrorEnvelope).error.code).toBe('VALIDATION_FAILED');
    });

    let subId = '';
    it('creates a monthly subscription one period out', async () => {
      const res = await post('/subscriptions', tokenA)
        .send({ variantId: chewVariantId, frequency: 'monthly' })
        .expect(201);

      const sub = (res.body as Envelope<SubscriptionDto>).data;
      subId = sub.id;
      expect(sub.id).toMatch(/^sub_[0-9a-f-]{36}$/);
      expect(sub.variantId).toBe(chewVariantId);
      expect(sub.frequency).toBe('monthly');
      expect(sub.status).toBe('active');
      expect(sub.cancelReason).toBeNull();

      // First auto-order lands roughly one month out.
      const due = new Date(sub.nextOrderAt).getTime();
      const month = 30 * 24 * 60 * 60 * 1000;
      expect(due).toBeGreaterThan(Date.now());
      expect(due).toBeLessThanOrEqual(
        Date.now() + month + 5 * 24 * 60 * 60 * 1000,
      );
    });

    it('lists only the caller’s subscriptions', async () => {
      const mine = (await get('/subscriptions', tokenA).expect(200))
        .body as Envelope<SubscriptionDto[]>;
      expect(mine.data.some((s) => s.id === subId)).toBe(true);

      const theirs = (await get('/subscriptions', tokenB).expect(200))
        .body as Envelope<SubscriptionDto[]>;
      expect(theirs.data.some((s) => s.id === subId)).toBe(false);
    });

    it('pauses, resumes, then cancels with a reason', async () => {
      const paused = (
        await patch(`/subscriptions/${subId}`, tokenA)
          .send({ status: 'paused' })
          .expect(200)
      ).body as Envelope<SubscriptionDto>;
      expect(paused.data.status).toBe('paused');

      const resumed = (
        await patch(`/subscriptions/${subId}`, tokenA)
          .send({ status: 'active' })
          .expect(200)
      ).body as Envelope<SubscriptionDto>;
      expect(resumed.data.status).toBe('active');

      const cancelled = (
        await patch(`/subscriptions/${subId}`, tokenA)
          .send({ status: 'cancelled', cancelReason: 'too many chews' })
          .expect(200)
      ).body as Envelope<SubscriptionDto>;
      expect(cancelled.data.status).toBe('cancelled');
      expect(cancelled.data.cancelReason).toBe('too many chews');
    });

    it('answers 404 for unknown subscriptions and 204 no-op deletes', async () => {
      await patch(
        '/subscriptions/sub_00000000-0000-4000-8000-000000000000',
        tokenA,
      )
        .send({ status: 'paused' })
        .expect(404);
      await del(
        '/subscriptions/sub_00000000-0000-4000-8000-000000000000',
        tokenA,
      ).expect(204);
    });
  });

  describe('subscription timer (tickOnce driven directly)', () => {
    let tick: SubscriptionTickService;

    beforeAll(() => {
      tick = app.get(SubscriptionTickService);
    });

    /** Forces a subscription due and returns the claimed due-at instant. */
    const forceDue = async (id: string) => {
      const dueAt = new Date(Date.now() - 60_000);
      await prisma.subscription.update({
        where: { id: PrefixedId.tryAnyToUuid(id) as string },
        data: { nextOrderAt: dueAt, status: 'active' },
      });
      return dueAt;
    };

    const readSub = (id: string) =>
      prisma.subscription.findUniqueOrThrow({
        where: { id: PrefixedId.tryAnyToUuid(id) as string },
      });

    it('orders and auto-captures a due subscription', async () => {
      const created = (
        await post('/subscriptions', tokenA)
          .send({ variantId: chewVariantId, frequency: 'monthly' })
          .expect(201)
      ).body as Envelope<SubscriptionDto>;
      const dueAt = await forceDue(created.data.id);
      const baseline = await readVariant(chewVariantUuid);

      await tick.tickOnce();

      const sub = await readSub(created.data.id);
      expect(sub.status).toBe('active');
      expect(sub.nextOrderAt.getTime()).toBeGreaterThan(Date.now());

      // The deterministic idempotency key pins exactly one order per period.
      const order = await prisma.order.findFirst({
        where: {
          idempotencyKey: `sub:${PrefixedId.tryAnyToUuid(
            created.data.id,
          )}:${dueAt.toISOString()}`,
        },
      });
      expect(order).not.toBeNull();
      expect(order!.status).toBe('paid');
      // Ship totals: 9.00 + 20% VAT + 4.99 flat shipping.
      expect(order!.grandTotal.toString()).toBe('15.79');

      const after = await readVariant(chewVariantUuid);
      expect(after.stockQuantity).toBe(baseline.stockQuantity - 1);
      expect(after.stockReserved).toBe(baseline.stockReserved);
    });

    it('pauses a prescription subscription until Pharmacy approves', async () => {
      const created = (
        await post('/subscriptions', tokenA)
          .send({ variantId: rxVariantId, frequency: 'monthly' })
          .expect(201)
      ).body as Envelope<SubscriptionDto>;
      await forceDue(created.data.id);

      await tick.tickOnce();

      const sub = await readSub(created.data.id);
      expect(sub.status).toBe('paused');
    });

    it('pauses instead of ordering when stock cannot be reserved', async () => {
      const created = (
        await post('/subscriptions', tokenA)
          .send({ variantId: chewVariantId, frequency: 'monthly' })
          .expect(201)
      ).body as Envelope<SubscriptionDto>;

      // Block every remaining unit, then let the timer find it due.
      const before = await readVariant(chewVariantUuid);
      await prisma.productVariant.update({
        where: { id: chewVariantUuid },
        data: { stockReserved: before.stockQuantity },
      });
      try {
        await forceDue(created.data.id);
        await tick.tickOnce();
        const sub = await readSub(created.data.id);
        expect(sub.status).toBe('paused');
      } finally {
        await prisma.productVariant.update({
          where: { id: chewVariantUuid },
          data: { stockReserved: before.stockReserved },
        });
      }
    });
  });

  describe('admin download-file upload', () => {
    it('creates a file record with a presigned PUT upload URL', async () => {
      const res = await post(
        `/admin/products/${videoProductId}/download-files`,
        adminToken,
      )
        .send({
          fileName: `e2e-extra-${runId}.mp4`,
          fileSizeBytes: 1024,
          mimeType: 'video/mp4',
        })
        .expect(201);

      const file = (
        res.body as Envelope<{
          id: string;
          objectKey: string;
          uploadUrl: string;
          uploadExpiresIn: number;
        }>
      ).data;
      // Clean up immediately so the suite is re-runnable without a reseed:
      // a lingering extra file would tie at sortOrder 0 and shift the
      // video pack's file-level download list for the next run.
      await prisma.productDownloadFile.delete({
        where: { id: PrefixedId.tryAnyToUuid(file.id) as string },
      });
      expect(file.id).toMatch(/^dfl_[0-9a-f-]{36}$/);
      expect(file.objectKey).toMatch(
        new RegExp(`^products/.*/downloads/[0-9a-f-]{36}$`),
      );
      expect(file.uploadUrl).toMatch(/^https?:\/\//);
      expect(file.uploadExpiresIn).toBeGreaterThan(0);
    });

    it('answers 404 for an unknown product and 403 for non-staff', async () => {
      const body = {
        fileName: 'ghost.pdf',
        fileSizeBytes: 10,
        mimeType: 'application/pdf',
      };
      await post(
        '/admin/products/prd_00000000-0000-4000-8000-000000000000/download-files',
        adminToken,
      )
        .send(body)
        .expect(404);
      await post(`/admin/products/${videoProductId}/download-files`, tokenA)
        .send(body)
        .expect(403);
    });
  });
});
