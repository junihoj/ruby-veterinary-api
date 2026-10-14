import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ErrorEnvelope } from '../src/shared/cross-cutting/envelope';
import { PrefixedId } from '../src/shared/kernel/domain/prefixed-id';
import type { AuthTokensDto } from '../src/modules/identity/application/dto/auth-response.dto';
import type {
  CartDto,
  CartItemDto,
  ProductDetailDto,
  ProductSummaryDto,
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
interface PagedEnvelope<T> {
  data: T[];
  meta: {
    requestId: string;
    timestamp: string;
    pagination: { limit: number; cursor: string | null; hasMore: boolean };
  };
}

/**
 * Commerce e2e (M3a): public catalog reads + cache headers, the
 * practice_manager admin product surface, and the signed-in cart lifecycle —
 * all through the production factory (createApp) so the exact global
 * pipeline is exercised. Requires DATABASE_URL → ruby_veterinary_test,
 * migrated and seeded (`pnpm db:seed`); the suite reads the seeded SKUs and
 * categories.
 *
 * Rows created here (one shopper + one draft product) are intentionally left
 * behind: every assertion is residue-tolerant, and the seeder re-baselines
 * variant stock at the start of each gate run.
 */
// The commerce app bootstrap (Swagger scan over 6 more controllers) exceeds
// Jest's 5s default hook timeout under parallel workers.
jest.setTimeout(120_000);

describe('Commerce catalog, admin & cart (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000)}`;
  const shopperEmail = `shopper-${runId}@example.com`;
  const shopperPassword = 'shopper-password-123';

  let shopperToken = '';
  let adminToken = '';

  // Seeded fixtures resolved in beforeAll (fail fast when unseeded).
  let categoryId = '';
  let fleaVariantId = '';
  let jointSmallVariantId = '';
  let rxVariantId = '';
  let telehealthVariantId = '';
  let telehealthProductId = '';

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

  beforeAll(async () => {
    app = (await createApp()) as INestApplication<App>;
    prisma = app.get(PrismaService);

    const [category, flea, jointSmall, rx, telehealth] = await Promise.all([
      prisma.productCategory.findUnique({
        where: { slug: 'parasite-control' },
      }),
      prisma.productVariant.findUnique({ where: { sku: 'SKU-FLS-001' } }),
      prisma.productVariant.findUnique({ where: { sku: 'SKU-JCC-S' } }),
      prisma.productVariant.findUnique({ where: { sku: 'SKU-ABX-100' } }),
      prisma.productVariant.findUnique({ where: { sku: 'SKU-TELE-30' } }),
    ]);
    if (!category || !flea || !jointSmall || !rx || !telehealth) {
      throw new Error(
        'Seed fixtures missing — run `pnpm db:seed` against the test DB first.',
      );
    }
    categoryId = category.id;
    fleaVariantId = PrefixedId.format('variant', flea.id);
    jointSmallVariantId = PrefixedId.format('variant', jointSmall.id);
    rxVariantId = PrefixedId.format('variant', rx.id);
    telehealthVariantId = PrefixedId.format('variant', telehealth.id);
    telehealthProductId = PrefixedId.format('product', telehealth.productId);

    // One shopper for cart flows: register + login (auth budget 10/10 min).
    await post('/auth/register')
      .send({ email: shopperEmail, password: shopperPassword })
      .expect(201);
    const login = await post('/auth/login')
      .send({ email: shopperEmail, password: shopperPassword })
      .expect(200);
    shopperToken = (login.body as Envelope<AuthTokensDto>).data.tokens
      .accessToken;

    // The seeded practice_manager (grace) holds catalog:write.
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

  describe('public catalog', () => {
    it('GET /products → 200 + cache header + pagination meta', async () => {
      const res = await get('/products').expect(200);

      expect(res.headers['cache-control']).toBe('public, max-age=60');
      const body = res.body as PagedEnvelope<ProductSummaryDto>;
      expect(body.data.length).toBeGreaterThanOrEqual(8);
      expect(body.data[0].id).toMatch(/^prd_[0-9a-f-]{36}$/);
      expect(body.data[0].category.slug).toBeTruthy();
      expect(typeof body.data[0].purchasable).toBe('boolean');
      expect(body.meta.pagination).toEqual({
        limit: 20,
        cursor: null,
        hasMore: false,
      });
    });

    it('GET /products?limit=3 → pages through a stable cursor', async () => {
      const first = await get('/products?limit=3').expect(200);
      const firstBody = first.body as PagedEnvelope<ProductSummaryDto>;
      expect(firstBody.data).toHaveLength(3);
      expect(firstBody.meta.pagination.hasMore).toBe(true);
      expect(firstBody.meta.pagination.cursor).toMatch(/^prd_[0-9a-f-]{36}$/);

      const second = await get(
        `/products?limit=3&cursor=${firstBody.meta.pagination.cursor}`,
      ).expect(200);
      const secondBody = second.body as PagedEnvelope<ProductSummaryDto>;
      const firstIds = new Set(firstBody.data.map((p) => p.id));
      expect(secondBody.data.some((p) => firstIds.has(p.id))).toBe(false);
    });

    it('GET /products?petType=dog → the dog-facet products only', async () => {
      const res = await get('/products?petType=dog').expect(200);
      const body = res.body as PagedEnvelope<ProductSummaryDto>;
      expect(body.data).toHaveLength(3);
      expect(new Set(body.data.map((p) => p.slug))).toEqual(
        new Set([
          'flea-tick-spot-on',
          'joint-care-chews',
          'antibiotic-oral-suspension',
        ]),
      );
    });

    it('GET /products?condition=joint_support → the joint diet', async () => {
      const res = await get('/products?condition=joint_support').expect(200);
      const body = res.body as PagedEnvelope<ProductSummaryDto>;
      expect(body.data.map((p) => p.slug)).toEqual(['joint-care-chews']);
    });

    it('GET /products?lifeStage=puppy_kitten → the puppy guide', async () => {
      const res = await get('/products?lifeStage=puppy_kitten').expect(200);
      const body = res.body as PagedEnvelope<ProductSummaryDto>;
      expect(body.data.map((p) => p.slug)).toEqual(['puppy-training-guide']);
    });

    it('GET /products?category=joint-care → the category slug filter', async () => {
      const res = await get('/products?category=joint-care').expect(200);
      const body = res.body as PagedEnvelope<ProductSummaryDto>;
      expect(body.data.map((p) => p.slug)).toEqual(['joint-care-chews']);
    });

    it('GET /products?q=joint → name/summary search', async () => {
      const res = await get('/products?q=joint').expect(200);
      const body = res.body as PagedEnvelope<ProductSummaryDto>;
      expect(body.data.map((p) => p.slug)).toEqual(['joint-care-chews']);
    });

    it('GET /products/{slug} (variable) → variants + fromPrice + facets', async () => {
      const res = await get('/products/joint-care-chews').expect(200);
      expect(res.headers['cache-control']).toBe('public, max-age=60');

      const detail = (res.body as Envelope<ProductDetailDto>).data;
      expect(detail.slug).toBe('joint-care-chews');
      expect(detail.productType).toBe('variable');
      expect(detail.purchasable).toBe(true);
      expect(detail.fromPrice).toBe('15.00');
      expect(detail.variants).toHaveLength(2);
      expect(detail.variants.find((v) => v.sku === 'SKU-JCC-S')?.price).toBe(
        '15.00',
      );
      expect(detail.variants.find((v) => v.sku === 'SKU-JCC-L')?.price).toBe(
        '24.00',
      );
      expect(detail.facets.petTypes).toContain('dog');
      expect(detail.facets.conditions).toContain('joint_support');
    });

    it('GET /products/{slug} (grouped) → members, not variants', async () => {
      const res = await get('/products/puppy-starter-bundle').expect(200);
      const detail = (res.body as Envelope<ProductDetailDto>).data;
      expect(detail.productType).toBe('grouped');
      expect(detail.purchasable).toBe(false);
      expect(detail.variants).toEqual([]);
      expect(detail.members.map((m) => m.slug)).toEqual([
        'flea-tick-spot-on',
        'puppy-training-guide',
      ]);
    });

    it('GET /products/{slug} (external) → partner link, not purchasable', async () => {
      const res = await get('/products/partner-diet-delivery').expect(200);
      const detail = (res.body as Envelope<ProductDetailDto>).data;
      expect(detail.productType).toBe('external');
      expect(detail.externalUrl).toBe('https://partner.example.com/renal-diet');
      expect(detail.buttonText).toBe('Order from partner');
      expect(detail.purchasable).toBe(false);
      expect(detail.fromPrice).toBeNull();
    });

    it('GET /products/{slug} (composite) → slots with pinned options', async () => {
      const res = await get('/products/wellness-box').expect(200);
      const detail = (res.body as Envelope<ProductDetailDto>).data;
      expect(detail.productType).toBe('composite');
      expect(detail.pricingMode).toBe('fixed');
      expect(detail.purchasable).toBe(false);
      expect(detail.slots).toHaveLength(2);
      expect(detail.slots[0].name).toBe('Choose your chew');
      expect(detail.slots[0].minSelect).toBe(1);
      expect(detail.slots[0].maxSelect).toBe(1);
      expect(detail.slots[0].options[0].variantId).toMatch(/^var_/);
      expect(detail.slots[1].name).toBe('Add a care guide');
      expect(detail.slots[1].minSelect).toBe(0);
      expect(detail.slots[1].options[0].priceOverride).toBe('3.00');
    });

    it('GET /products/{slug} (Rx + virtual flags) → prescription + virtual', async () => {
      const rx = await get('/products/antibiotic-oral-suspension').expect(200);
      expect(
        (rx.body as Envelope<ProductDetailDto>).data.requiresPrescription,
      ).toBe(true);

      const tele = await get('/products/telehealth-triage').expect(200);
      const teleDetail = (tele.body as Envelope<ProductDetailDto>).data;
      expect(teleDetail.isVirtual).toBe(true);
      expect(teleDetail.purchasable).toBe(true);
    });

    it('GET /products/{slug} → 404 for unknown slugs', async () => {
      const res = await get('/products/no-such-product').expect(404);
      expect((res.body as ErrorEnvelope).error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('admin products (catalog:write)', () => {
    const draftName = `E2E Draft ${runId}`;
    let draftId = '';

    it('rejects a non-staff caller (403)', async () => {
      await post('/admin/products', shopperToken)
        .send({ name: 'Nope', categoryId, productType: 'simple' })
        .expect(403);
    });

    it('rejects a non-staff PATCH (403)', async () => {
      await patch(`/admin/products/${telehealthProductId}`, shopperToken)
        .send({ summary: 'Nope' })
        .expect(403);
    });

    it('creates a draft product (201, unpublished)', async () => {
      const res = await post('/admin/products', adminToken)
        .send({
          name: draftName,
          categoryId: PrefixedId.format('productCategory', categoryId),
          productType: 'simple',
          summary: 'Draft for the M3a admin e2e.',
        })
        .expect(201);

      const created = (res.body as Envelope<ProductDetailDto>).data;
      draftId = created.id;
      expect(created.id).toMatch(/^prd_[0-9a-f-]{36}$/);
      expect(created.slug).toBe(`e2e-draft-${runId}`);
      expect(created.published).toBe(false);
      expect(created.variants).toEqual([]);
    });

    it('answers 400 when the generated slug is already in use', async () => {
      const res = await post('/admin/products', adminToken)
        .send({
          name: draftName,
          categoryId: PrefixedId.format('productCategory', categoryId),
          productType: 'simple',
        })
        .expect(400);
      expect((res.body as ErrorEnvelope).error.code).toBe('VALIDATION_FAILED');
    });

    it('answers 400 for an unknown category', async () => {
      await post('/admin/products', adminToken)
        .send({
          name: `E2E Orphan ${runId}`,
          categoryId: 'pcat_00000000-0000-4000-8000-000000000000',
          productType: 'simple',
        })
        .expect(400);
    });

    it('patches the draft (200)', async () => {
      const res = await patch(`/admin/products/${draftId}`, adminToken)
        .send({ summary: 'Updated draft summary.' })
        .expect(200);

      const updated = (res.body as Envelope<ProductDetailDto>).data;
      expect(updated.id).toBe(draftId);
      expect(updated.summary).toBe('Updated draft summary.');
      expect(updated.published).toBe(false);
    });

    it('answers 404 for an unknown product id', async () => {
      const res = await patch(
        '/admin/products/prd_00000000-0000-4000-8000-000000000000',
        adminToken,
      )
        .send({ summary: 'Ghost.' })
        .expect(404);
      expect((res.body as ErrorEnvelope).error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('maintains variant stock through PATCH /admin/products/{id}', async () => {
      const res = await patch(
        `/admin/products/${telehealthProductId}`,
        adminToken,
      )
        .send({ variantId: telehealthVariantId, stockQuantity: 88 })
        .expect(200);

      const detail = (res.body as Envelope<ProductDetailDto>).data;
      const variant = detail.variants.find((v) => v.sku === 'SKU-TELE-30');
      expect(variant?.availableQuantity).toBe(88);
    });

    it('answers 404 for a variant that belongs to another product', async () => {
      await patch(`/admin/products/${draftId}`, adminToken)
        .send({ variantId: telehealthVariantId, stockQuantity: 1 })
        .expect(404);
    });
  });

  describe('cart lifecycle', () => {
    let fleaLineId = '';

    it('requires authentication (401)', async () => {
      await get('/cart').expect(401);
      await post('/cart').expect(401);
    });

    it('GET /cart → 200 empty shape before anything is ensured', async () => {
      const res = await get('/cart', shopperToken).expect(200);
      const cart = (res.body as Envelope<CartDto>).data;
      expect(cart.id).toBeNull();
      expect(cart.items).toEqual([]);
      expect(cart.itemCount).toBe(0);
      expect(cart.subtotal).toBe('0.00');
    });

    it('POST /cart → 200 and is idempotent (ensure)', async () => {
      const first = await post('/cart', shopperToken).expect(200);
      const cartId = (first.body as Envelope<CartDto>).data.id as string;
      expect(cartId).toMatch(/^crt_[0-9a-f-]{36}$/);

      const second = await post('/cart', shopperToken).expect(200);
      expect((second.body as Envelope<CartDto>).data.id).toBe(cartId);
    });

    it('POST /cart/items → 201 with money strings', async () => {
      const res = await post('/cart/items', shopperToken)
        .send({ variantId: fleaVariantId, quantity: 2 })
        .expect(201);

      const line = (res.body as Envelope<CartItemDto>).data;
      fleaLineId = line.id;
      expect(line.id).toMatch(/^cit_[0-9a-f-]{36}$/);
      expect(line.name).toBe('Flea & Tick Spot-On');
      expect(line.productType).toBe('simple');
      expect(line.requiresPrescription).toBe(false);
      expect(line.unitPrice).toBe('12.50');
      expect(line.quantity).toBe(2);
      expect(line.lineTotal).toBe('25.00');
    });

    it('merges a repeat add of the same variant into the same line', async () => {
      const res = await post('/cart/items', shopperToken)
        .send({ variantId: fleaVariantId, quantity: 1 })
        .expect(201);

      const line = (res.body as Envelope<CartItemDto>).data;
      expect(line.id).toBe(fleaLineId);
      expect(line.quantity).toBe(3);
      expect(line.lineTotal).toBe('37.50');

      const cart = (await get('/cart', shopperToken).expect(200))
        .body as Envelope<CartDto>;
      expect(cart.data.items).toHaveLength(1);
      expect(cart.data.itemCount).toBe(3);
      expect(cart.data.subtotal).toBe('37.50');
    });

    it('answers 422 PRESCRIPTION_PENDING for an Rx variant', async () => {
      const res = await post('/cart/items', shopperToken)
        .send({ variantId: rxVariantId, quantity: 1 })
        .expect(422);
      expect((res.body as ErrorEnvelope).error.code).toBe(
        'PRESCRIPTION_PENDING',
      );
    });

    it('answers 400 for unknown and malformed variant ids', async () => {
      await post('/cart/items', shopperToken)
        .send({
          variantId: 'var_00000000-0000-4000-8000-000000000000',
          quantity: 1,
        })
        .expect(400);
      await post('/cart/items', shopperToken)
        .send({ variantId: 'not-a-variant', quantity: 1 })
        .expect(400);
    });

    it('answers 400 for composite components (M3b)', async () => {
      const res = await post('/cart/items', shopperToken)
        .send({
          variantId: jointSmallVariantId,
          quantity: 1,
          components: [
            {
              slotId: 'csl_00000000-0000-4000-8000-000000000000',
              variantId: jointSmallVariantId,
              quantity: 1,
            },
          ],
        })
        .expect(400);
      expect((res.body as ErrorEnvelope).error.code).toBe('VALIDATION_FAILED');
    });

    it('answers 409 STOCK_CHANGED when the advisory stock check fails', async () => {
      // Seeded stock for SKU-JCC-S is 25; 999 can never be available.
      const res = await post('/cart/items', shopperToken)
        .send({ variantId: jointSmallVariantId, quantity: 999 })
        .expect(409);
      expect((res.body as ErrorEnvelope).error.code).toBe('STOCK_CHANGED');
    });

    it('PATCH /cart/items → 200 updates the quantity, 0 removes', async () => {
      const updated = await patch(
        `/cart/items?itemId=${fleaLineId}`,
        shopperToken,
      )
        .send({ quantity: 5 })
        .expect(200);
      expect(
        (updated.body as Envelope<CartDto>).data.items.find(
          (i) => i.id === fleaLineId,
        )?.quantity,
      ).toBe(5);

      const removed = await patch(
        `/cart/items?itemId=${fleaLineId}`,
        shopperToken,
      )
        .send({ quantity: 0 })
        .expect(200);
      expect((removed.body as Envelope<CartDto>).data.items).toEqual([]);
    });

    it('PATCH /cart/items → 400 for unknown and malformed line ids', async () => {
      await patch(
        '/cart/items?itemId=cit_00000000-0000-4000-8000-000000000000',
        shopperToken,
      )
        .send({ quantity: 1 })
        .expect(400);
      await patch('/cart/items?itemId=garbage', shopperToken)
        .send({ quantity: 1 })
        .expect(400);
    });

    it('DELETE /cart/items → 204 and stays idempotent', async () => {
      const added = await post('/cart/items', shopperToken)
        .send({ variantId: fleaVariantId, quantity: 1 })
        .expect(201);
      const lineId = (added.body as Envelope<CartItemDto>).data.id;

      await del(`/cart/items?itemId=${lineId}`, shopperToken).expect(204);
      await del(`/cart/items?itemId=${lineId}`, shopperToken).expect(204);

      const cart = (await get('/cart', shopperToken).expect(200))
        .body as Envelope<CartDto>;
      expect(cart.data.items).toEqual([]);
    });

    it('DELETE /cart → 204 clears the cart but keeps it open', async () => {
      await del('/cart', shopperToken).expect(204);

      const cart = (await get('/cart', shopperToken).expect(200))
        .body as Envelope<CartDto>;
      expect(cart.data.id).toMatch(/^crt_/);
      expect(cart.data.status).toBe('open');
      expect(cart.data.items).toEqual([]);
      expect(cart.data.itemCount).toBe(0);
    });
  });
});
