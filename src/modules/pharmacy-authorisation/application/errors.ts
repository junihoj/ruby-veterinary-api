import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Contract error factories (pharmacy.yaml + api-specification §Error Model).
 * The 403 split is the pharmacy signature: `STAFF_ONLY` comes from the
 * shared RolesGuard when `rx:review` is missing; `PRESCRIBER_REQUIRED`
 * fires inside decision handlers when the caller holds `rx:review` but not
 * the veterinarian role (e.g. practice_manager reads the queue, never decides).
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

/** 403 — the caller may read the queue but not make clinical decisions. */
export function prescriberRequired(message: string): HttpException {
  return new HttpException(
    { code: 'PRESCRIBER_REQUIRED', message },
    HttpStatus.FORBIDDEN,
  );
}

/** 409 — terminal or concurrently decided request (never reopens). */
export function stateConflict(message: string): HttpException {
  return new HttpException(
    { code: 'STATE_CONFLICT', message },
    HttpStatus.CONFLICT,
  );
}

/** 422 with a stable business-rule code (e.g. PRIMARY_VET_REQUIRED). */
export function unprocessable(code: string, message: string): HttpException {
  return new HttpException({ code, message }, HttpStatus.UNPROCESSABLE_ENTITY);
}
