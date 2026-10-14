import { HttpException, HttpStatus } from '@nestjs/common';
import { PrefixedId } from '../../../shared/kernel/domain/prefixed-id';

/**
 * Inbound pagination cursors are the prefixed id we serialised on the way out
 * (`doc_<uuid>`); bare UUIDs are tolerated so both forms round-trip. Anything
 * else is a 400 instead of a Prisma UUID error (500) down the stack.
 */
export function parseCursor(cursor?: string): string | undefined {
  if (!cursor) return undefined;
  const uuid = PrefixedId.tryAnyToUuid(cursor);
  if (uuid === null) {
    throw new HttpException(
      { code: 'VALIDATION_FAILED', message: 'Invalid cursor.' },
      HttpStatus.BAD_REQUEST,
    );
  }
  return uuid;
}
