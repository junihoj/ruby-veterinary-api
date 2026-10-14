import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ErrorEnvelope } from '../src/shared/cross-cutting/envelope';
import type {
  AuthTokensDto,
  AuthUserDto,
} from '../src/modules/identity/application/dto/auth-response.dto';

/** Response envelope typed at the assertion sites (supertest body is any). */
interface Envelope<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}

/**
 * Auth e2e (M2): happy path + rejection paths + rotation/reuse semantics
 * against the test database, through the production factory (createApp).
 * Contract: auth endpoints allow 10 requests per 10 minutes per IP, so this
 * suite keeps its request counts inside that budget until the final
 * deliberate overflow test. Requires DATABASE_URL → ruby_veterinary_test.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const email = `test-${Date.now()}@example.com`;
  const password = 'test-password-123';

  /** Access/refresh pair from the first successful login (stateless JWT). */
  let accessToken = '';
  let refreshToken = '';
  /** The first refresh token after rotation — presenting it again = reuse. */
  let rotatedAwayRefreshToken = '';

  const post = (path: string) =>
    request(app.getHttpServer()).post(`/api/v1/auth${path}`);
  const get = (path: string) =>
    request(app.getHttpServer()).get(`/api/v1/auth${path}`);

  beforeAll(async () => {
    app = (await createApp()) as INestApplication<App>;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Child rows first: sessions/user_roles FKs to users are ON DELETE RESTRICT.
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  it('register → 201 with prefixed id, displayName and client role', async () => {
    const res = await post('/register')
      .send({ email, password, displayName: 'Test User' })
      .expect(201);

    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as Envelope<AuthUserDto>;
    expect(body.data.id).toMatch(/^usr_[0-9a-f-]{36}$/);
    expect(body.data.email).toBe(email);
    expect(body.data.displayName).toBe('Test User');
    expect(body.data.kind).toBe('client');
    expect(body.data.roles).toEqual(['client']);
    expect(body.meta.requestId).toBeTruthy();
  });

  it('register duplicate email → 409 EMAIL_TAKEN', async () => {
    const res = await post('/register').send({ email, password }).expect(409);

    expect((res.body as ErrorEnvelope).error.code).toBe('EMAIL_TAKEN');
  });

  it('register short password → 400 VALIDATION_FAILED', async () => {
    const res = await post('/register')
      .send({ email: `short-${Date.now()}@example.com`, password: 'short' })
      .expect(400);

    expect((res.body as ErrorEnvelope).error.code).toBe('VALIDATION_FAILED');
  });

  it('login → 200 with token pair', async () => {
    const res = await post('/login').send({ email, password }).expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as Envelope<AuthTokensDto>;
    expect(body.data.tokens.accessToken).toBeTruthy();
    expect(body.data.tokens.refreshToken).toBeTruthy();
    expect(body.data.tokens.tokenType).toBe('Bearer');
    expect(body.data.tokens.expiresIn).toBe(900);
    expect(body.data.user.email).toBe(email);
    accessToken = body.data.tokens.accessToken;
    refreshToken = body.data.tokens.refreshToken;
  });

  it('login wrong password → 401 INVALID_CREDENTIALS', async () => {
    const res = await post('/login')
      .send({ email, password: 'wrong-password-123' })
      .expect(401);

    expect((res.body as ErrorEnvelope).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('login unknown email → 401 INVALID_CREDENTIALS', async () => {
    const res = await post('/login')
      .send({ email: `unknown-${Date.now()}@example.com`, password })
      .expect(401);

    expect((res.body as ErrorEnvelope).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('refresh → 200 rotates the pair', async () => {
    rotatedAwayRefreshToken = refreshToken;

    const res = await post('/refresh').send({ refreshToken }).expect(200);

    const body = res.body as Envelope<AuthTokensDto>;
    expect(body.data.tokens.refreshToken).not.toBe(rotatedAwayRefreshToken);
    expect(body.data.tokens.refreshToken).toBeTruthy();
    expect(body.data.user.email).toBe(email);
    refreshToken = body.data.tokens.refreshToken;
    accessToken = body.data.tokens.accessToken;
  });

  it('refresh reuse → 401 + every session of the user revoked', async () => {
    // Presenting the rotated-away token again is reuse = compromise.
    const reuse = await post('/refresh')
      .send({ refreshToken: rotatedAwayRefreshToken })
      .expect(401);
    expect((reuse.body as ErrorEnvelope).error.code).toBe(
      'INVALID_CREDENTIALS',
    );

    // The session issued by the rotation above must be dead too — revocation
    // is family-wide, not just for the presented token.
    const family = await post('/refresh').send({ refreshToken }).expect(401);
    expect((family.body as ErrorEnvelope).error.code).toBe(
      'INVALID_CREDENTIALS',
    );

    // Reuse is not an account lockout: a fresh login works and its refresh
    // token is live again.
    const fresh = await post('/login').send({ email, password }).expect(200);
    const freshTokens = (fresh.body as Envelope<AuthTokensDto>).data.tokens;
    await post('/refresh')
      .send({ refreshToken: freshTokens.refreshToken })
      .expect(200);
    refreshToken = freshTokens.refreshToken;
    accessToken = freshTokens.accessToken;
  });

  it('logout → 204 then its refresh token is dead', async () => {
    const login = await post('/login').send({ email, password }).expect(200);
    const tokens = (login.body as Envelope<AuthTokensDto>).data.tokens;

    // api-specification.md endpoint table: logout requires Bearer auth.
    const out = await post('/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ refreshToken: tokens.refreshToken })
      .expect(204);
    expect(out.headers['cache-control']).toBe('no-store');

    const res = await post('/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
    expect((res.body as ErrorEnvelope).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('me → 200 with identity and no-store', async () => {
    const res = await get('/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as Envelope<AuthUserDto>;
    expect(body.data.email).toBe(email);
    expect(body.data.displayName).toBe('Test User');
    expect(body.data.roles).toEqual(['client']);
  });

  it('me without token → 401', async () => {
    const res = await get('/me').expect(401);

    expect((res.body as ErrorEnvelope).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('me with invalid token → 401 INVALID_CREDENTIALS', async () => {
    const res = await get('/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);

    expect((res.body as ErrorEnvelope).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('auth rate limit → 429 RATE_LIMITED with Retry-After', async () => {
    // Five logins have happened above; the contract allows 10 per 10 minutes
    // per IP. Burn the remaining budget, then the limit must bite. Runs last
    // because it deliberately exhausts the login window for this suite.
    let limitedCode = '';
    let sawRetryAfter = false;
    for (let i = 0; i < 15 && limitedCode === ''; i += 1) {
      const res = await post('/login').send({ email, password });
      if (res.status === 429) {
        limitedCode = (res.body as ErrorEnvelope).error.code;
        sawRetryAfter = res.headers['retry-after'] !== undefined;
      } else {
        expect(res.status).toBe(200);
      }
    }

    expect(limitedCode).toBe('RATE_LIMITED');
    expect(sawRetryAfter).toBe(true);
  });
});
