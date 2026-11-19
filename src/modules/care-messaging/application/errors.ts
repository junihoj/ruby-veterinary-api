import { HttpException, HttpStatus } from '@nestjs/common';

/** REST contract errors (openapi/messaging.yaml + api-specification §Chat). */

export function unauthorized(
  message = 'Chat session is invalid or expired.',
): HttpException {
  return new HttpException(
    { code: 'UNAUTHORIZED', message },
    HttpStatus.UNAUTHORIZED,
  );
}

export function originNotAllowed(): HttpException {
  return new HttpException(
    { code: 'FORBIDDEN', message: 'Origin is not allowed.' },
    HttpStatus.FORBIDDEN,
  );
}

export function invalidSecret(): HttpException {
  return new HttpException(
    {
      code: 'INVALID_SECRET',
      message: 'Webhook secret is missing or invalid.',
    },
    HttpStatus.UNAUTHORIZED,
  );
}

export function validationFailed(message: string): HttpException {
  return new HttpException(
    { code: 'VALIDATION_FAILED', message },
    HttpStatus.BAD_REQUEST,
  );
}

export function rateLimited(retryAfterMs: number): HttpException {
  const error = new HttpException(
    {
      code: 'RATE_LIMITED',
      message: 'Too many requests; please wait and retry.',
      details: [{ retryAfterMs }],
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
  return error;
}

/** WS error codes (messaging-protocol.md §Error Codes). */
export const WS_ERROR = {
  RATE_LIMITED: 'RATE_LIMITED',
  CAP_REACHED: 'CAP_REACHED',
  MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',
  SESSION_FULL: 'SESSION_FULL',
  UNAUTHORIZED: 'UNAUTHORIZED',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  INTERNAL: 'INTERNAL',
} as const;

export function isExpiredError(error: unknown): boolean {
  if (!(error instanceof HttpException)) return false;
  const unauthorizedStatus = 401;
  const status = error.getStatus();
  if (status !== unauthorizedStatus) return false;
  const response = error.getResponse();
  return (
    typeof response === 'object' &&
    response !== null &&
    (response as { code?: string }).code === 'UNAUTHORIZED'
  );
}
