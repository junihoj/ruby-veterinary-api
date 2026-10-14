import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Contract error factories (api-specification §Error Model). Every commerce
 * failure carries a stable `code` clients branch on; messages are
 * plain-language and safe to show end users.
 */

export function badRequest(message: string): HttpException {
  return new HttpException(
    { code: 'VALIDATION_FAILED', message },
    HttpStatus.BAD_REQUEST,
  );
}

export function notFound(message: string): HttpException {
  return new HttpException(
    { code: 'RESOURCE_NOT_FOUND', message },
    HttpStatus.NOT_FOUND,
  );
}

export function stockChanged(message: string): HttpException {
  return new HttpException(
    { code: 'STOCK_CHANGED', message },
    HttpStatus.CONFLICT,
  );
}

export function prescriptionPending(message: string): HttpException {
  return new HttpException(
    { code: 'PRESCRIPTION_PENDING', message },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

export function idempotencyConflict(message: string): HttpException {
  return new HttpException(
    { code: 'IDEMPOTENCY_CONFLICT', message },
    HttpStatus.CONFLICT,
  );
}

export function dependencyUnavailable(message: string): HttpException {
  return new HttpException(
    { code: 'DEPENDENCY_UNAVAILABLE', message },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}
