import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { ChatSession } from '../../../../generated/prisma/client';
import type { ChatSessionState } from '../../application/dto/chat.types';

@Injectable()
export class ChatSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: ChatSession): ChatSessionState {
    return {
      id: row.id,
      conversationId: row.conversationId,
      clientType: row.clientType,
      status: row.status,
      lastSeq: Number(row.lastSeq),
      expiresAt: row.expiresAt,
      handoffStartedAt: row.handoffStartedAt,
      lastActivityAt: row.lastActivityAt,
    };
  }

  async create(input: {
    tokenHash: string;
    clientType: string;
    conversationId: string;
    expiresAt: Date;
  }): Promise<ChatSessionState> {
    const row = await this.prisma.chatSession.create({ data: input });
    return this.map(row);
  }

  async findById(id: string): Promise<ChatSessionState | null> {
    const row = await this.prisma.chatSession.findUnique({ where: { id } });
    return row ? this.map(row) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<ChatSessionState | null> {
    const row = await this.prisma.chatSession.findUnique({
      where: { tokenHash },
    });
    return row ? this.map(row) : null;
  }

  async rotateToken(id: string, tokenHash: string): Promise<void> {
    await this.prisma.chatSession.update({
      where: { id },
      data: { tokenHash, lastActivityAt: new Date() },
    });
  }

  async touch(id: string): Promise<void> {
    await this.prisma.chatSession.update({
      where: { id },
      data: { lastActivityAt: new Date() },
    });
  }

  async markHandoff(id: string, expiresAt: Date): Promise<void> {
    const now = new Date();
    await this.prisma.chatSession.update({
      where: { id },
      data: {
        status: 'handoff',
        handoffStartedAt: now,
        expiresAt,
        lastActivityAt: now,
      },
    });
  }

  async markExpired(id: string): Promise<void> {
    await this.prisma.chatSession.update({
      where: { id },
      data: { status: 'expired' },
    });
  }

  /**
   * Deletes messages for every session whose TTL elapsed and marks the session
   * `expired` (kept so a reconnect can receive the `expired` frame).
   */
  async sweep(now: Date): Promise<number> {
    const expired = await this.prisma.chatSession.findMany({
      where: {
        status: { in: ['active', 'handoff'] },
        expiresAt: { lt: now },
      },
      select: { id: true },
    });
    if (expired.length === 0) return 0;
    const ids = expired.map((row) => row.id);
    await this.prisma.$transaction([
      this.prisma.inboxMessage.deleteMany({
        where: { sessionId: { in: ids } },
      }),
      this.prisma.chatSession.updateMany({
        where: { id: { in: ids } },
        data: { status: 'expired', lastSeq: 0 },
      }),
    ]);
    return ids.length;
  }
}
