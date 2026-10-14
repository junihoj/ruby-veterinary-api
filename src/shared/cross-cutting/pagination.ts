import { HttpException, HttpStatus } from '@nestjs/common';
import { PrefixedId } from '../kernel/domain/prefixed-id';

/**
 * Collection pagination shared by every list endpoint (M2 clinic reads, M3a
 * commerce reads): inbound cursors are the prefixed id we serialised on the
 * way out (`doc_<uuid>`); bare UUIDs are tolerated so both forms round-trip.
 * Anything else is a 400 instead of a Prisma UUID error (500) down the stack.
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

/**
 * Contract limit (LimitParam): 1..100, default 20. Anything non-numeric —
 * including a missing value — falls back to the default instead of failing.
 */
export function toLimit(raw?: string, fallback = 20): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(1, Math.trunc(n)));
}
