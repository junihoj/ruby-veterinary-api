import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { envelope } from './envelope';

/**
 * The request-id hook (see request-id.ts) attaches `requestId` to every
 * inbound request before it reaches controllers.
 */
type RequestWithId = Request & { requestId?: string };

/**
 * Wraps every successful (non-exception) response in the `{ data, meta }`
 * success envelope (§9). Controllers return their domain/DTO result directly;
 * the requestId is taken from the request context set by the request-id hook.
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<RequestWithId>();
    const requestId = req.requestId ?? '';

    return next.handle().pipe(
      map((body: unknown) => {
        // Already enveloped (e.g. a controller that set pagination) — pass through.
        if (
          body !== null &&
          typeof body === 'object' &&
          'data' in body &&
          'meta' in body
        ) {
          return body;
        }
        return envelope(body, requestId);
      }),
    );
  }
}
