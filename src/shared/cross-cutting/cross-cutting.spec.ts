import { of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { EnvelopeInterceptor } from './envelope.interceptor';
import { envelope } from './envelope';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';
import { RequestIdMiddleware } from './request-id.middleware';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function httpContext(req: unknown, res: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

describe('shared/cross-cutting', () => {
  describe('resolveRequestId', () => {
    it('reuses a valid incoming id', () => {
      expect(resolveRequestId('abc-123')).toBe('abc-123');
    });

    it('trims whitespace around an incoming id', () => {
      expect(resolveRequestId('  spaced  ')).toBe('spaced');
    });

    it('generates a UUID when the incoming id is missing', () => {
      expect(resolveRequestId()).toMatch(UUID_RE);
      expect(resolveRequestId('')).toMatch(UUID_RE);
    });

    it('generates a UUID when the incoming id exceeds 128 chars', () => {
      expect(resolveRequestId('a'.repeat(129))).toMatch(UUID_RE);
    });
  });

  describe('RequestIdMiddleware', () => {
    function run(headerValue?: string) {
      const req = {
        header: (name: string) =>
          name === REQUEST_ID_HEADER ? headerValue : undefined,
      } as unknown as Request;
      const headers: Record<string, string> = {};
      const res = {
        headers,
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
      } as unknown as Response & { headers: Record<string, string> };
      const next = jest.fn();

      new RequestIdMiddleware().use(req, res, next);
      return { req, res, next };
    }

    it('attaches a generated id and echoes the header', () => {
      const { req, res, next } = run();
      expect((req as Request & { requestId: string }).requestId).toMatch(
        UUID_RE,
      );
      expect(res.headers[REQUEST_ID_HEADER]).toMatch(UUID_RE);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('honours an incoming correlation id', () => {
      const { req, res } = run('trace-me-42');
      expect((req as Request & { requestId: string }).requestId).toBe(
        'trace-me-42',
      );
      expect(res.headers[REQUEST_ID_HEADER]).toBe('trace-me-42');
    });
  });

  describe('envelope', () => {
    it('wraps data with requestId and an ISO timestamp', () => {
      const result = envelope({ id: 'ord_1' }, 'req-1');
      expect(result.data).toEqual({ id: 'ord_1' });
      expect(result.meta.requestId).toBe('req-1');
      expect(Number.isNaN(Date.parse(result.meta.timestamp))).toBe(false);
    });

    it('omits pagination when not supplied', () => {
      expect(envelope(null, 'req-1').meta.pagination).toBeUndefined();
    });

    it('includes pagination when supplied', () => {
      const result = envelope([], 'req-1', { cursor: 'c2', limit: 20 });
      expect(result.meta.pagination).toEqual({ cursor: 'c2', limit: 20 });
    });
  });

  describe('EnvelopeInterceptor', () => {
    it('wraps a plain body in the success envelope', (done) => {
      const interceptor = new EnvelopeInterceptor();
      const req = { requestId: 'req-9' };
      const next = { handle: () => of({ hello: 'world' }) } as CallHandler;

      interceptor.intercept(httpContext(req, {}), next).subscribe((value) => {
        const enveloped = value as {
          data: unknown;
          meta: { requestId: string; timestamp: string };
        };
        expect(enveloped.data).toEqual({ hello: 'world' });
        expect(enveloped.meta.requestId).toBe('req-9');
        expect(Number.isNaN(Date.parse(enveloped.meta.timestamp))).toBe(false);
        done();
      });
    });

    it('merges requestId + timestamp into a controller-supplied meta', (done) => {
      const interceptor = new EnvelopeInterceptor();
      const alreadyEnveloped = { data: [1], meta: { requestId: 'req-9' } };
      const next = {
        handle: () => of(alreadyEnveloped),
      } as CallHandler;

      interceptor
        .intercept(httpContext({ requestId: 'req-9' }, {}), next)
        .subscribe((value) => {
          const merged = value as {
            data: unknown;
            meta: { requestId: string; timestamp: string };
          };
          expect(merged.data).toBe(alreadyEnveloped.data);
          expect(merged.meta.requestId).toBe('req-9');
          expect(Number.isNaN(Date.parse(merged.meta.timestamp))).toBe(false);
          done();
        });
    });

    it('defaults to an empty requestId when the hook did not run', (done) => {
      const interceptor = new EnvelopeInterceptor();
      const next = { handle: () => of('plain') } as CallHandler;

      interceptor.intercept(httpContext({}, {}), next).subscribe((value) => {
        const enveloped = value as {
          data: unknown;
          meta: { requestId: string };
        };
        expect(enveloped.data).toBe('plain');
        expect(enveloped.meta.requestId).toBe('');
        done();
      });
    });

    it('leaves non-http contexts alone', (done) => {
      const interceptor = new EnvelopeInterceptor();
      const rpcContext = {
        getType: () => 'rpc',
        switchToHttp: () => ({
          getRequest: () => ({}),
          getResponse: () => ({}),
        }),
      } as unknown as ExecutionContext;
      const handled = Symbol('rpc');
      const next = { handle: () => of(handled) } as CallHandler;

      interceptor.intercept(rpcContext, next).subscribe((value) => {
        expect(value).toBe(handled);
        done();
      });
    });
  });
});
