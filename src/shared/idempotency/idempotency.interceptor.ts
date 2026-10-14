import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mergeMap, Observable, of } from 'rxjs';
import { IdempotencyStore } from './idempotency.store';

interface RequestLike {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  user?: { id?: string };
  rawBody?: Buffer;
  body?: unknown;
}

/**
 * Route-scoped `Idempotency-Key` middleware (api-specification §Idempotency;
 * plan M3a): a replayed key within 24 hours returns the original body
 * verbatim; the same key with a different body is `409 IDEMPOTENCY_CONFLICT`.
 *
 * Runs after the global envelope interceptor, so stored bodies are the
 * pre-envelope handler results — a replay is re-wrapped with a fresh
 * requestId exactly like the original. Scope includes the user id, so keys
 * never cross accounts. The route's own status code is re-applied by Nest on
 * replay, so no status juggling is needed here.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly store: IdempotencyStore) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<RequestLike>();
    const header = req.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key) return next.handle();
    if (key.length > 128) {
      throw new HttpException(
        {
          code: 'VALIDATION_FAILED',
          message: 'Idempotency-Key must be at most 128 characters.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const userId = req.user?.id;
    const scope = `checkout:${userId ?? 'anonymous'}`;
    const requestHash = sha256(req.rawBody ?? JSON.stringify(req.body ?? null));
    const existing = await this.store.find(scope, key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new HttpException(
          {
            code: 'IDEMPOTENCY_CONFLICT',
            message:
              'This Idempotency-Key was already used with a different request body.',
          },
          HttpStatus.CONFLICT,
        );
      }
      return of(existing.responseBody);
    }

    return next.handle().pipe(
      // Persist before the response is emitted, so a retry after a lost
      // answer still finds the original instead of double-charging.
      mergeMap(async (result) => {
        await this.store.record({
          scope,
          key,
          userId: userId ?? null,
          requestHash,
          responseStatus: responseStatusFor(req.method),
          responseBody: result,
        });
        return result;
      }),
    );
  }
}

/** Best effort for the stored row: 201 for POST (Nest default), else 200. */
function responseStatusFor(method: string): number {
  return method === 'POST' ? 201 : 200;
}

function sha256(payload: Buffer | string): string {
  return createHash('sha256').update(payload).digest('hex');
}
