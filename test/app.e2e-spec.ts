import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApp } from '../src/app.factory';
import type { ErrorEnvelope } from '../src/shared/cross-cutting/envelope';

/** Response envelope typed at the assertion sites (supertest body is any). */
interface Envelope<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}

/**
 * App bootstrap e2e: the full production pipeline (createApp) boots and
 * health endpoints respond through the real envelope/filters. Requires
 * DATABASE_URL (compose, :5433).
 */
describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = (await createApp()) as INestApplication<App>;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/live → 200', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200);

    const body = res.body as Envelope<{ status: string }>;
    expect(body.data.status).toBe('ok');
    expect(body.meta.requestId).toBeTruthy();
  });

  it('GET /api/v1/health/ready → 200 (DB reachable)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200);

    expect((res.body as Envelope<{ status: string }>).data.status).toBe('ok');
  });

  it('unknown route → 404 RESOURCE_NOT_FOUND envelope', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/definitely-not-a-route')
      .expect(404);

    expect((res.body as ErrorEnvelope).error.code).toBe('RESOURCE_NOT_FOUND');
  });
});
