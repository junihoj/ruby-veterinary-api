import { HttpException, HttpStatus } from '@nestjs/common';

/** Contract error factories for the admin AI document surface. */

export function notFound(message = 'Document not found.'): HttpException {
  return new HttpException(
    { code: 'RESOURCE_NOT_FOUND', message },
    HttpStatus.NOT_FOUND,
  );
}

export function validationFailed(message: string): HttpException {
  return new HttpException(
    { code: 'VALIDATION_FAILED', message },
    HttpStatus.BAD_REQUEST,
  );
}

export function stateConflict(message: string): HttpException {
  return new HttpException(
    { code: 'STATE_CONFLICT', message },
    HttpStatus.CONFLICT,
  );
}

export function aiUnavailable(message: string): HttpException {
  return new HttpException(
    { code: 'DEPENDENCY_UNAVAILABLE', message },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}
