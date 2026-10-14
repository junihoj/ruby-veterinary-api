import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface SessionRow {
  id: string;
  userId: string;
  refreshTokenHash: string;
  deviceLabel: string | null;
  ip: string | null;
  userAgent: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Session repository (identity) â€” refresh-token rotation state (ADR-0011).
 * The only place outside this class that may import prisma.* for sessions.
 */
@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Active (not revoked, not expired) session for a refresh-token hash. */
  async findActiveByTokenHash(hash: string): Promise<SessionRow | null> {
    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash: hash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return session ?? null;
  }

  /** Any session for a hash â€” used to detect reuse of a revoked token. */
  async findByTokenHash(hash: string): Promise<SessionRow | null> {
    const session = await this.prisma.session.findFirst({
      where: { refreshTokenHash: hash },
    });
    return session ?? null;
  }

  async create(data: {
    userId: string;
    refreshTokenHash: string;
    deviceLabel?: string;
    ip?: string;
    userAgent?: string;
    expiresAt: Date;
  }): Promise<SessionRow> {
    return this.prisma.session.create({ data });
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.session.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /** Compromise response: revoke every session of the user. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
