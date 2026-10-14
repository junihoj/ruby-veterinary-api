import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApp } from '../src/app.factory';
import type { ErrorEnvelope } from '../src/shared/cross-cutting/envelope';
import type {
  ClinicContactDto,
  ClinicHoursDto,
  DocumentDownloadDto,
  DocumentSummaryDto,
  ServiceDetailDto,
  ServiceSummaryDto,
  StaffProfileDto,
} from '../src/modules/clinic-content/application/dto/clinic-content.dto';

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
 * Clinic Content e2e (M2): seven sessionless public reads + cache headers.
 * Uses the production factory (createApp) so the exact global pipeline —
 * prefix, validation, envelope, filters, guards, throttler — is exercised.
 * Requires DATABASE_URL pointing at ruby_veterinary_test (compose, :5433).
 */
describe('Clinic Content (e2e)', () => {
  let app: INestApplication<App>;

  const get = (path: string) =>
    request(app.getHttpServer()).get(`/api/v1${path}`);

  beforeAll(async () => {
    app = (await createApp()) as INestApplication<App>;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /clinic/hours → 200 + cache header', async () => {
    const res = await get('/clinic/hours').expect(200);

    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const body = res.body as Envelope<ClinicHoursDto>;
    expect(body.data.timezone).toBe('Europe/London');
    expect(body.data).toHaveProperty('openNow');
    expect(body.data.standard).toHaveLength(7);
    expect(body.data.holidays).toBeDefined();
    expect(body.meta.requestId).toBeTruthy();
    expect(body.meta.timestamp).toBeDefined();
  });

  it('GET /clinic/contact → 200 + cache header', async () => {
    const res = await get('/clinic/contact').expect(200);

    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const body = res.body as Envelope<ClinicContactDto>;
    expect(body.data.name).toBe('Ruby Veterinary Clinic');
    expect(body.data.mainPhone).toBe('+442071234567');
    expect(body.data.emergencyPhone).toBe('+442071234568');
  });

  it('GET /services → 200 + cache header + pagination + prefixed ids', async () => {
    const res = await get('/services').expect(200);

    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const body = res.body as PagedEnvelope<ServiceSummaryDto>;
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].id).toMatch(/^svc_[0-9a-f-]{36}$/);
    expect(body.data[0].slug).toBeTruthy();
    expect(body.data[0]).toHaveProperty('baselinePrice');
    expect(body.meta.pagination.limit).toBe(20);
    expect(body.meta.pagination.hasMore).toBe(false);
    expect(body.meta.pagination.cursor).toBeNull();
  });

  it('GET /services?limit=999 → clamps to the contract maximum of 100', async () => {
    const res = await get('/services?limit=999').expect(200);

    const body = res.body as PagedEnvelope<ServiceSummaryDto>;
    expect(body.meta.pagination.limit).toBe(100);
  });

  it('GET /services/:slug → 200', async () => {
    const res = await get('/services/consultation').expect(200);

    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const body = res.body as Envelope<ServiceDetailDto>;
    expect(body.data.slug).toBe('consultation');
    expect(body.data.name).toBe('Consultation');
    expect(body.data.id).toMatch(/^svc_[0-9a-f-]{36}$/);
  });

  it('GET /services/:slug (unknown) → 404 RESOURCE_NOT_FOUND', async () => {
    const res = await get('/services/nonexistent-service').expect(404);

    expect((res.body as ErrorEnvelope).error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('GET /staff → 200 + cache header + prefixed ids', async () => {
    const res = await get('/staff').expect(200);

    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const body = res.body as PagedEnvelope<StaffProfileDto>;
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].id).toMatch(/^stf_[0-9a-f-]{36}$/);
    expect(body.data[0].displayName).toBeTruthy();
    expect(body.data[0].title).toBeTruthy();
  });

  it('GET /documents → 200 + cache header + prefixed ids', async () => {
    const res = await get('/documents').expect(200);

    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const body = res.body as PagedEnvelope<DocumentSummaryDto>;
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0].id).toMatch(/^doc_[0-9a-f-]{36}$/);
    expect(body.data[0].title).toBeTruthy();
    expect(body.data[0].mimeType).toBeTruthy();
  });

  it('GET /documents?limit=1 → cursor round-trips to the next page', async () => {
    const first = await get('/documents?limit=1').expect(200);
    const firstBody = first.body as PagedEnvelope<DocumentSummaryDto>;
    expect(firstBody.data).toHaveLength(1);
    expect(firstBody.meta.pagination.hasMore).toBe(true);
    expect(firstBody.meta.pagination.cursor).toMatch(/^doc_[0-9a-f-]{36}$/);

    const cursor = firstBody.meta.pagination.cursor;
    const second = await get(`/documents?limit=1&cursor=${cursor}`).expect(200);
    const secondBody = second.body as PagedEnvelope<DocumentSummaryDto>;
    expect(secondBody.data).toHaveLength(1);
    expect(secondBody.data[0].id).not.toBe(firstBody.data[0].id);
    expect(secondBody.meta.pagination.hasMore).toBe(false);
  });

  it('GET /documents?cursor=junk → 400 VALIDATION_FAILED', async () => {
    const res = await get('/documents?cursor=not-a-cursor').expect(400);

    expect((res.body as ErrorEnvelope).error.code).toBe('VALIDATION_FAILED');
  });

  it('GET /documents/:id → 200 with signed download URL', async () => {
    const list = await get('/documents').expect(200);
    const docId = (list.body as PagedEnvelope<DocumentSummaryDto>).data[0].id;

    const res = await get(`/documents/${docId}`).expect(200);

    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const body = res.body as Envelope<DocumentDownloadDto>;
    expect(body.data.downloadUrl).toContain('X-Amz-Signature');
    expect(body.data.expiresAt).toBeDefined();
  });

  it('GET /documents/:id (unknown) → 404 RESOURCE_NOT_FOUND', async () => {
    const res = await get('/documents/doc_nonexistent').expect(404);

    expect((res.body as ErrorEnvelope).error.code).toBe('RESOURCE_NOT_FOUND');
  });
});
