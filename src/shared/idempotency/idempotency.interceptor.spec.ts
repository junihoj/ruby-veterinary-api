import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { firstValueFrom, of } from 'rxjs';
import { IDEMPOTENCY_SCOPE_KEY } from './idempotency.decorator';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { IdempotencyStore, type IdempotencyRecord } from './idempotency.store';

const KEY = '9f2c4e10-aaaa-bbbb-cccc-000000000001';

function storedRecord(
  overrides: Partial<IdempotencyRecord> = {},
): IdempotencyRecord {
  return {
    scope: 'intake:anonymous',
    key: KEY,
    requestHash: '',
    responseStatus: 201,
    responseBody: { intakeSubmissionId: 'int_1' },
    createdAt: new Date(),
    ...overrides,
  };
}

function makeContext(options: {
  key?: string;
  userId?: string;
  body?: unknown;
  method?: string;
}): ExecutionContext {
  const handler = () => undefined;
  return {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => ({
        method: options.method ?? 'POST',
        headers: options.key ? { 'idempotency-key': options.key } : {},
        user: options.userId ? { id: options.userId } : undefined,
        body: options.body ?? null,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('IdempotencyInterceptor (route-scoped, M4)', () => {
  let store: {
    find: jest.Mock;
    record: jest.Mock;
  };
  let reflector: { getAllAndOverride: jest.Mock };
  let interceptor: IdempotencyInterceptor;
  let next: { handle: jest.Mock };

  beforeEach(() => {
    store = { find: jest.fn(), record: jest.fn() };
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    };
    interceptor = new IdempotencyInterceptor(
      store as unknown as IdempotencyStore,
      reflector as unknown as Reflector,
    );
    next = { handle: jest.fn() };
  });

  it('passes through untouched when no key is sent', async () => {
    const body = { ok: true };
    next.handle.mockReturnValue(of(body));

    const result = await firstValueFrom(
      await interceptor.intercept(makeContext({}), next),
    );
    expect(result).toBe(body);
    expect(store.find).not.toHaveBeenCalled();
  });

  it('scopes the key with the @Idempotent name and the caller id', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === IDEMPOTENCY_SCOPE_KEY ? 'appointment-request' : undefined,
    );
    next.handle.mockReturnValue(of({ appointmentRequestId: 'apt_1' }));

    await firstValueFrom(
      await interceptor.intercept(
        makeContext({ key: KEY, userId: 'usr-1', body: { a: 1 } }),
        next,
      ),
    );
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      IDEMPOTENCY_SCOPE_KEY,
      expect.any(Array),
    );
    expect(store.record).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'appointment-request:usr-1', key: KEY }),
    );
  });

  it('falls back to the checkout scope and anonymous caller', async () => {
    next.handle.mockReturnValue(of({ ok: true }));

    await firstValueFrom(
      await interceptor.intercept(makeContext({ key: KEY }), next),
    );
    expect(store.record).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'checkout:anonymous', userId: null }),
    );
  });

  it('replays the stored body on a same-hash hit without the handler', async () => {
    const record = storedRecord();
    record.requestHash = createHash('sha256')
      .update(JSON.stringify({ a: 1 }))
      .digest('hex');
    store.find.mockResolvedValue(record);

    const result = await firstValueFrom(
      await interceptor.intercept(
        makeContext({ key: KEY, body: { a: 1 } }),
        next,
      ),
    );
    expect(result).toEqual({ intakeSubmissionId: 'int_1' });
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('answers 409 when the key is reused with a different body', async () => {
    const record = storedRecord();
    record.requestHash = 'other-hash';
    store.find.mockResolvedValue(record);

    const promise = interceptor.intercept(
      makeContext({ key: KEY, body: { a: 2 } }),
      next,
    );
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(
      interceptor.intercept(makeContext({ key: KEY, body: { a: 2 } }), next),
    ).rejects.toMatchObject({ status: 409 });
  });
});
