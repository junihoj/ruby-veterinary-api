import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { ChatSessionRepository } from '../../infrastructure/repositories/chat-session.repository';
import { ConversationRepository } from '../../infrastructure/repositories/conversation.repository';
import { HandoverRepository } from '../../infrastructure/repositories/handover.repository';
import { MessageRepository } from '../../infrastructure/repositories/message.repository';
import { ProviderThreadRepository } from '../../infrastructure/repositories/provider-thread.repository';
import {
  MessagingProviderPort,
  type ProviderThreadRef,
} from '../ports/messaging-provider-port';
import { handoffConfirmation } from '../services/safe-responses';
import type { ChatEmitter } from '../dto/chat.frames';
import type { ResolvedChatSession } from '../dto/chat.types';

/**
 * Visitor asks for a human. Creates the handover row, opens a provider thread
 * (Telegram forum topic) when configured, then emits `handoff:requested` and
 * the confirmation. Provider failures degrade to the clinic contact path and
 * never block the visitor's session.
 */
@Injectable()
export class RequestChatHandoffHandler {
  private readonly logger = new Logger(RequestChatHandoffHandler.name);

  constructor(
    private readonly sessions: ChatSessionRepository,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly handovers: HandoverRepository,
    private readonly providerThreads: ProviderThreadRepository,
    @Inject(MessagingProviderPort)
    private readonly provider: MessagingProviderPort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(
    context: ResolvedChatSession,
    emit: ChatEmitter['emit'],
  ): Promise<void> {
    const session = context.session;
    let handover = await this.handovers.findOpen(
      context.conversationId,
      'telegram',
    );
    const isNewHandover = !handover;

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
    }

    if (!handover) {
      handover = await this.handovers.createRequested(
        context.conversationId,
        'telegram',
        'owner_request',
      );
    }

    if (isNewHandover) {
      await this.openProviderThread(context, handover.id);
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

  private async openProviderThread(
    context: ResolvedChatSession,
    handoverId: string,
  ): Promise<void> {
    if (!this.provider.isConfigured()) {
      this.logger.warn(
        'Handoff requested while the messaging provider is unconfigured; visitor keeps the clinic contact fallback.',
      );
      return;
    }

    try {
      const lastQuestion = await this.messages.lastVisitorText(
        context.session.id,
      );
      const thread = await this.provider.createThread({
        conversationId: context.conversationId,
        sessionId: context.session.id,
        title: this.topicTitle(context),
        intro: this.topicIntro(context, lastQuestion),
      });
      await this.storeThread(context.conversationId, handoverId, thread);
    } catch (error) {
      this.logger.error(
        `Failed to open handoff thread for conversation ${context.conversationId}: ${(error as Error).message}`,
      );
    }
  }

  private async storeThread(
    conversationId: string,
    handoverId: string,
    thread: ProviderThreadRef,
  ): Promise<void> {
    await this.providerThreads.upsert(
      conversationId,
      thread.provider,
      thread.threadId,
      thread.metadata,
    );
    await this.handovers.attachThread(handoverId, thread.threadId);
  }

  private topicTitle(context: ResolvedChatSession): string {
    const time = new Date().toISOString().slice(11, 16);
    return `Web chat ${time} · ${context.session.id.slice(0, 4)}`;
  }

  private topicIntro(
    context: ResolvedChatSession,
    lastQuestion: string | null,
  ): string {
    const question = lastQuestion
      ? `Last question: ${lastQuestion.slice(0, 400)}`
      : 'The visitor has not sent a question yet.';
    return [
      'New web chat handoff',
      `Session: ${context.session.id.slice(0, 8)}`,
      question,
      '',
      'Reply in this topic to message the visitor.',
      'Commands: /claim — assign to yourself; /close — end the handoff; /note <text> — internal note.',
    ].join('\n');
  }
}
