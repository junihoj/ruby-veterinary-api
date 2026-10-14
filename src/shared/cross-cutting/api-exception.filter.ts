import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorEnvelope } from './envelope';

/**
 * Maps thrown exceptions to the `{ error: { code, message, details, requestId } }`
 * error envelope (§9). HttpExceptions keep their status and stable `code`
 * (from the exception's response). Anything else becomes a 500 INTERNAL so we
 * never leak stack traces or internals to clients.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId ?? '';

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let details: Array<{ field?: string; issue: string }> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        if (typeof b.code === 'string') code = b.code;
        if (typeof b.message === 'string') message = b.message;
        if (Array.isArray(b.message)) {
          // class-validator ValidationException: message is an array of issues.
          code = 'VALIDATION_FAILED';
          details = b.message.map((issue) => ({ issue: String(issue) }));
          message = 'Request validation failed.';
        }
      }
      // 429 (HttpStatus.TOO_MANY_REQUESTS) carries no stable code — map by
      // status (§9), after body parsing so the envelope keeps the contract
      // message + code. Numeric literals keep comparisons enum-free (lint).
      if (status === 429 && code === 'INTERNAL_ERROR') {
        code = 'RATE_LIMITED';
        message = 'Too many requests. Please slow down.';
      }
      // Canonical code per status when the exception did not name one (e.g.
      // the built-in 404 for an unmatched route): api-specification.md §Errors.
      if (code === 'INTERNAL_ERROR') {
        if (status === 400) {
          code = 'VALIDATION_FAILED';
        } else if (status === 404) {
          code = 'RESOURCE_NOT_FOUND';
        }
      }
      if (status >= 500) this.logger.error(message, exception.stack);
    } else {
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const envelope: ErrorEnvelope = {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        requestId,
      },
    };
    res.status(status).json(envelope);
  }
}
