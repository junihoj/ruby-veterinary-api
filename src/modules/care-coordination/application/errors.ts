import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Contract error factories for intake (intake.yaml). Every failure carries a
 * stable `code` clients branch on; messages are plain-language and safe to
 * show end users.
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

/** 409 — invalid status transition or revisiting a terminal row. */
export function stateConflict(message: string): HttpException {
  return new HttpException(
    { code: 'STATE_CONFLICT', message },
    HttpStatus.CONFLICT,
  );
}

/** 422 — intake acceptance blocked (existing client without clientId). */
export function intakeNotAcceptable(message: string): HttpException {
  return new HttpException(
    { code: 'INTAKE_NOT_ACCEPTABLE', message },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/** 422 — finalise blocked because the object is absent from storage. */
export function uploadMissing(message: string): HttpException {
  return new HttpException(
    { code: 'UPLOAD_MISSING', message },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/** 413 — declared upload exceeds the 10 MB contract cap. */
export function uploadTooLarge(message: string): HttpException {
  return new HttpException(
    { code: 'UPLOAD_TOO_LARGE', message },
    HttpStatus.PAYLOAD_TOO_LARGE,
  );
}
