import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { ChatSessionRepository } from '../../infrastructure/repositories/chat-session.repository';
import { ConversationRepository } from '../../infrastructure/repositories/conversation.repository';
import { HandoverRepository } from '../../infrastructure/repositories/handover.repository';
import { MessageRepository } from '../../infrastructure/repositories/message.repository';
import { handoffConfirmation } from '../services/safe-responses';
import type { ChatEmitter } from '../dto/chat.frames';
import type { ResolvedChatSession } from '../dto/chat.types';

@Injectable()
export class RequestChatHandoffHandler {
  constructor(
    private readonly sessions: ChatSessionRepository,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly handovers: HandoverRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(
    context: ResolvedChatSession,
    emit: ChatEmitter['emit'],
  ): Promise<void> {
    const session = context.session;

    if (session.status !== 'handoff') {
      await this.sessions.markHandoff(
        session.id,
        new Date(
          Date.now() + this.config.chat.handoffRetentionHours * 3_600_000,
        ),
      );
      await this.conversations.setStatus(
        context.conversationId,
        'awaiting_handover',
      );
      const existing = await this.handovers.findOpen(
        context.conversationId,
        'telegram',
      );
      if (!existing) {
        await this.handovers.createRequested(
          context.conversationId,
          'telegram',
          'owner_request',
        );
      }
    }

    const handoffMessage = await this.messages.append({
      sessionId: session.id,
      conversationId: context.conversationId,
      direction: 'outbound',
      senderType: 'system',
      frameType: 'handoff',
      bodyText: JSON.stringify({ state: 'requested' }),
      clientType: session.clientType,
    });
    emit({
      seq: handoffMessage.seq,
      type: 'handoff',
      state: 'requested',
    });

    const confirmation = await this.messages.append({
      sessionId: session.id,
      conversationId: context.conversationId,
      direction: 'outbound',
      senderType: 'bot',
      frameType: 'token',
      bodyText: handoffConfirmation(this.config.clinic.phone),
      clientType: session.clientType,
    });
    emit({
      seq: confirmation.seq,
      type: 'token',
      role: 'assistant',
      text: confirmation.message.bodyText,
      final: true,
    });
    emit({
      seq: confirmation.seq,
      type: 'done',
      messageSeq: confirmation.seq,
    });
  }
}
