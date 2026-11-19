import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '../../../../generated/prisma/client';
import type { InboxMessage } from '../../../../generated/prisma/client';
import type { CitationDto } from '../../../ai-assistant/application/ports/ai-assistant-port';
import type {
  AppendChatMessageInput,
  ChatMessageState,
} from '../../application/dto/chat.types';

@Injectable()
export class MessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: InboxMessage): ChatMessageState {
    return {
      id: row.id,
      seq: Number(row.seq ?? 0),
      direction: row.direction,
      senderType: row.senderType,
      frameType: row.frameType ?? 'token',
      bodyText: row.bodyText,
      citations: Array.isArray(row.citations)
        ? (row.citations as unknown as CitationDto[])
        : null,
      createdAt: row.createdAt,
    };
  }

  /**
   * Allocates the next per-session `seq` and inserts the message in one
   * transaction (ADR-0017 seq allocation). The UPDATE row lock totally orders
   * concurrent writers.
   */
  async append(
    input: AppendChatMessageInput,
  ): Promise<{ message: ChatMessageState; seq: number }> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.chatSession.update({
        where: { id: input.sessionId },
        data: { lastSeq: { increment: 1 }, lastActivityAt: new Date() },
        select: { lastSeq: true },
      });
      const seq = Number(updated.lastSeq);
      const row = await tx.inboxMessage.create({
        data: {
          conversationId: input.conversationId,
          sessionId: input.sessionId,
          seq: BigInt(seq),
          direction: input.direction,
          senderType: input.senderType,
          frameType: input.frameType,
          bodyText: input.bodyText,
          clientType: input.clientType ?? null,
          requestId: input.requestId ?? null,
          dedupeKey: `chat:${input.sessionId}:${seq}`,
          status: 'sent',
          ...(input.citations
            ? {
                citations: input.citations as unknown as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
      return { message: this.map(row), seq };
    });
  }

  async updateBody(
    id: string,
    bodyText: string,
    citations?: CitationDto[],
  ): Promise<void> {
    await this.prisma.inboxMessage.update({
      where: { id },
      data: {
        bodyText,
        ...(citations
          ? { citations: citations as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async replay(
    sessionId: string,
    afterSeq: number,
    since: Date,
  ): Promise<ChatMessageState[]> {
    const rows = await this.prisma.inboxMessage.findMany({
      where: {
        sessionId,
        seq: { gt: BigInt(afterSeq) },
        createdAt: { gt: since },
      },
      orderBy: { seq: 'asc' },
    });
    return rows.map((row) => this.map(row));
  }

  async count(sessionId: string): Promise<number> {
    return this.prisma.inboxMessage.count({ where: { sessionId } });
  }
}
