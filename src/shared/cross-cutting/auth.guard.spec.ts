import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY, Public, REQUIRES_KEY, Requires } from './decorators';

const ACCESS_SECRET = 'unit-test-access-secret';
const REFRESH_SECRET = 'unit-test-refresh-secret';

const config = {
  databaseUrl: 'postgres://unused',
  nodeEnv: 'test' as const,
  port: 3000,
  jwtAccessSecret: ACCESS_SECRET,
  jwtRefreshSecret: REFRESH_SECRET,
  jwtAccessTtlSeconds: 900,
  jwtRefreshTtlSeconds: 2_592_000,
  swaggerEnabled: false,
  corsOrigins: [],
};

function httpContext(req: unknown): ExecutionContext {
  const handler = function routeHandler() {};
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function makeGuard(): AuthGuard {
  return new AuthGuard(new JwtService(), new Reflector(), config);
}

function errCode(err: unknown): { status: number; code: string } {
  const e = err as HttpException;
  return {
    status: e.getStatus(),
    code: (e.getResponse() as { code: string }).code,
  };
}

describe('AuthGuard', () => {
  const jwt = new JwtService();

  function sign(
    payload: Record<string, unknown>,
    opts: { expiresIn?: number; secret?: string } = {},
  ): string {
    return jwt.sign(payload, {
      secret: opts.secret ?? ACCESS_SECRET,
      expiresIn: opts.expiresIn ?? 900,
    });
  }

  it('rejects a missing bearer token with 401 INVALID_CREDENTIALS', async () => {
    const err = await makeGuard()
      .canActivate(httpContext({ headers: {} }))
      .catch((e: unknown) => e);
    expect(errCode(err)).toEqual({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('accepts a valid token and attaches the identity to the request', async () => {
    const req = {
      headers: {
        authorization: `Bearer ${sign({
          sub: 'user-1',
          email: 'a@b.com',
          kind: 'staff',
          roles: ['veterinarian'],
          permissions: ['rx:review'],
        })}`,
      },
    };

    await expect(makeGuard().canActivate(httpContext(req))).resolves.toBe(true);
    expect(req).toMatchObject({
      user: {
        id: 'user-1',
        email: 'a@b.com',
        kind: 'staff',
        roles: ['veterinarian'],
        permissions: ['rx:review'],
      },
    });
  });

  it('expired token â†’ 401 TOKEN_EXPIRED (distinct from invalid)', async () => {
    const expired = sign({ sub: 'user-1' }, { expiresIn: -60 });
    const err = await makeGuard()
      .canActivate(
        httpContext({ headers: { authorization: `Bearer ${expired}` } }),
      )
      .catch((e: unknown) => e);
    expect(errCode(err)).toEqual({ status: 401, code: 'TOKEN_EXPIRED' });
  });

  it('token signed with the refresh secret â†’ 401 INVALID_CREDENTIALS', async () => {
    const crossSigned = sign({ sub: 'user-1' }, { secret: REFRESH_SECRET });
    const err = await makeGuard()
      .canActivate(
        httpContext({ headers: { authorization: `Bearer ${crossSigned}` } }),
      )
      .catch((e: unknown) => e);
    expect(errCode(err)).toEqual({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('garbage token â†’ 401 INVALID_CREDENTIALS', async () => {
    const err = await makeGuard()
      .canActivate(
        httpContext({ headers: { authorization: 'Bearer not-a-jwt' } }),
      )
      .catch((e: unknown) => e);
    expect(errCode(err)).toEqual({ status: 401, code: 'INVALID_CREDENTIALS' });
  });

  it('@Public routes bypass the guard entirely', async () => {
    const handler = function decorated() {};
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
    const ctx = {
      ...httpContext({ headers: {} }),
      getHandler: () => handler,
      getClass: () => undefined,
    } as unknown as ExecutionContext;

    await expect(makeGuard().canActivate(ctx)).resolves.toBe(true);
  });

  it('the @Public decorator sets the opt-out metadata', () => {
    const route = function routeHandler() {};
    Public()({}, 'route', { value: route });
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, route)).toBe(true);
  });
});

describe('Requires metadata', () => {
  it('stores role/permission requirements', () => {
    const route = function routeHandler() {};
    Requires({ roles: ['practice_manager'] })({}, 'route', { value: route });
    expect(Reflect.getMetadata(REQUIRES_KEY, route)).toEqual({
      roles: ['practice_manager'],
    });
  });
});
