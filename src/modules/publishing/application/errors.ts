import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Contract error factories (api-specification §Error Model). Publishing has
 * no extra business codes in M7: invalid references and duplicate slugs are
 * VALIDATION_FAILED; missing rows are RESOURCE_NOT_FOUND.
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
