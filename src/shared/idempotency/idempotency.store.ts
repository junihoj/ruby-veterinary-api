import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Replay window for money-moving endpoints (operations.md idempotency_keys). */
export const IDEMPOTENCY_TTL_HOURS = 24;

export interface IdempotencyRecord {
  scope: string;
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
}

/**
 * Platform-level replay/dedupe store behind the `Idempotency-Key` contract
 * (api-specification §Idempotency) and the inbound webhook dedupe rule
 * (webhooks.yaml). Deliberately not context-owned: M3a checkout, M4 client
 * intake, and M5 prescription submission all reuse it (operations.md).
 */
@Injectable()
export class IdempotencyStore {
  constructor(private readonly prisma: PrismaService) {}

  /** Row within the 24h replay window, or null when absent or expired. */
  async find(scope: string, key: string): Promise<IdempotencyRecord | null> {
    const row = await this.prisma.idempotencyKey.findUnique({
      where: { scope_key: { scope, key } },
    });
    if (!row) return null;

    const cutoff = Date.now() - IDEMPOTENCY_TTL_HOURS * 3_600_000;
    if (row.createdAt.getTime() < cutoff) {
      // Expired: drop it so the same key can legitimately run again.
      await this.prisma.idempotencyKey.deleteMany({ where: { id: row.id } });
      return null;
    }
    return toRecord(row);
  }

  /**
   * Record a fresh success. Returns null when a concurrent request won the
   * unique (scope, key) race — the caller re-reads and replays or conflicts.
   */
  async record(input: {
    scope: string;
    key: string;
    userId: string | null;
    requestHash: string;
    responseStatus: number;
    responseBody: unknown;
  }): Promise<IdempotencyRecord | null> {
    try {
      const row = await this.prisma.idempotencyKey.create({
        data: {
          scope: input.scope,
          key: input.key,
          userId: input.userId,
          requestHash: input.requestHash,
          responseStatus: input.responseStatus,
          // JSON null (not SQL NULL) for empty bodies — keeps the column
          // queryable by (scope, key) semantics in either shape.
          responseBody:
            input.responseBody === undefined || input.responseBody === null
              ? Prisma.JsonNull
              : (input.responseBody as Prisma.InputJsonValue),
        },
      });
      return toRecord(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }
}

type KeyRow = {
  scope: string;
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
};

function toRecord(row: KeyRow): IdempotencyRecord {
  return {
    scope: row.scope,
    key: row.key,
    requestHash: row.requestHash,
    responseStatus: row.responseStatus,
    responseBody: row.responseBody ?? null,
    createdAt: row.createdAt,
  };
}
