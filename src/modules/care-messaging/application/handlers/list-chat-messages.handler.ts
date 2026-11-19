import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { MessageRepository } from '../../infrastructure/repositories/message.repository';
import { ttlSince } from './replay-chat.handler';
import type { ResolvedChatSession } from '../dto/chat.types';

export interface ChatMessageDto {
  id: string;
  seq: number;
  direction: string;
  senderType: string;
  body: string;
  frameType: string;
  citations: unknown[] | null;
  createdAt: string;
}

/** REST replay fallback for mobile clients (openapi/messaging.yaml). */
@Injectable()
export class ListChatMessagesHandler {
  constructor(
    private readonly messages: MessageRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(
    context: ResolvedChatSession,
    afterSeq: number,
  ): Promise<{ messages: ChatMessageDto[] }> {
    const rows = await this.messages.replay(
      context.session.id,
      afterSeq,
      ttlSince(context, this.config),
    );
    return {
      messages: rows.map((row) => ({
        id: row.id,
        seq: row.seq,
        direction: row.direction,
        senderType: row.senderType,
        body: row.bodyText,
        frameType: row.frameType,
        citations: row.citations,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
