import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Contract error factories for client records (client-records.yaml). Every
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

/** 409 — a second active client link for the same identity account. */
export function alreadyLinked(message: string): HttpException {
  return new HttpException(
    { code: 'ALREADY_LINKED', message },
    HttpStatus.CONFLICT,
  );
}

/** 422 — primary-vet target does not hold the veterinarian role. */
export function notVeterinarian(message: string): HttpException {
  return new HttpException(
    { code: 'NOT_A_VETERINARIAN', message },
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
