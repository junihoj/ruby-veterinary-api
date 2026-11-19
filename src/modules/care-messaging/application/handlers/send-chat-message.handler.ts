import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import {
  AiAssistantPort,
  type AnswerResult,
} from '../../../ai-assistant/application/ports/ai-assistant-port';
import { ChatSessionRepository } from '../../infrastructure/repositories/chat-session.repository';
import { ChatUsageRepository } from '../../infrastructure/repositories/chat-usage.repository';
import { MessageRepository } from '../../infrastructure/repositories/message.repository';
import { ProviderThreadRepository } from '../../infrastructure/repositories/provider-thread.repository';
import {
  MessagingProviderPort,
  type ProviderThreadRef,
} from '../ports/messaging-provider-port';
import { ChatRateLimiter } from '../services/rate-limiter.service';
import { MessageClassifierService } from '../services/message-classifier.service';
import {
  emergencyResponse,
  privateDataResponse,
} from '../services/safe-responses';
import { ttlSince } from './replay-chat.handler';
import { WS_ERROR } from '../errors';
import type { ChatEmitter, ChatFrame } from '../dto/chat.frames';
import type { ResolvedChatSession } from '../dto/chat.types';

export interface SendChatMessageInput {
  context: ResolvedChatSession;
  text: string;
  ip: string;
  requestId?: string;
  emit: ChatEmitter['emit'];
}

@Injectable()
export class SendChatMessageHandler {
  constructor(
    private readonly messages: MessageRepository,
    private readonly sessions: ChatSessionRepository,
    private readonly usage: ChatUsageRepository,
    private readonly classifier: MessageClassifierService,
    private readonly limiter: ChatRateLimiter,
    private readonly providerThreads: ProviderThreadRepository,
    @Inject(AiAssistantPort) private readonly ai: AiAssistantPort,
    @Inject(MessagingProviderPort)
    private readonly provider: MessagingProviderPort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(input: SendChatMessageInput): Promise<void> {
    const { context, emit } = input;
    const session = context.session;
    const text = input.text?.trim() ?? '';

    if (!text) return;

    if (text.length > this.config.chat.maxMessageChars) {
      emit(this.error(0, WS_ERROR.MESSAGE_TOO_LONG));
      return;
    }

    if (
      !this.limiter.allow(`ip:${input.ip}`, this.config.chat.ratePerIpPerMin) ||
      !this.limiter.allow(
        `session:${session.id}`,
        this.config.chat.ratePerSessionPerMin,
      )
    ) {
      emit(this.error(0, WS_ERROR.RATE_LIMITED, 60_000));
      return;
    }

    const messageCount = await this.messages.count(session.id);
    if (messageCount >= this.config.chat.maxMessagesPerSession) {
      emit(this.error(0, WS_ERROR.SESSION_FULL));
      return;
    }

    // History is read before the new turn so the question is not duplicated
    // inside the prompt's conversation block.
    const historyRows = await this.messages.replay(
      session.id,
      0,
      ttlSince(context, this.config),
    );
    const history = historyRows
      .filter(
        (row) =>
          (row.senderType === 'visitor' || row.senderType === 'bot') &&
          row.bodyText.trim().length > 0 &&
          row.frameType === 'token',
      )
      .slice(-10)
      .map((row) => ({
        role:
          row.senderType === 'visitor'
            ? ('user' as const)
            : ('assistant' as const),
        content: row.bodyText,
      }));

    const userMessage = await this.messages.append({
      sessionId: session.id,
      conversationId: context.conversationId,
      direction: 'inbound',
      senderType: 'visitor',
      frameType: 'token',
      bodyText: text,
      clientType: session.clientType,
      requestId: input.requestId ?? null,
    });
    emit({
      seq: userMessage.seq,
      type: 'token',
      role: 'user',
      text,
      final: true,
    });
    emit({ seq: userMessage.seq, type: 'done', messageSeq: userMessage.seq });

    // A human has taken over: relay to the provider thread; the bot stays silent.
    if (session.status === 'handoff') {
      await this.sessions.extendHandoff(
        session.id,
        new Date(
          Date.now() + this.config.chat.handoffRetentionHours * 3_600_000,
        ),
      );
      await this.relayToStaff(context, text, emit);
      return;
    }

    const classification = this.classifier.classify(text);
    if (classification === 'emergency') {
      await this.fixedResponse(
        context,
        emergencyResponse(this.config.clinic.phone),
        input,
      );
      return;
    }
    if (classification === 'private_data') {
      await this.fixedResponse(
        context,
        privateDataResponse(
          this.config.clinic.phone,
          this.config.clinic.contactUrl,
          this.config.clinic.bookingUrl,
        ),
        input,
      );
      return;
    }

    if (await this.usage.isCapReached()) {
      emit(this.error(userMessage.seq, WS_ERROR.CAP_REACHED));
      return;
    }

    const assistantMessage = await this.messages.append({
      sessionId: session.id,
      conversationId: context.conversationId,
      direction: 'outbound',
      senderType: 'bot',
      frameType: 'token',
      bodyText: '',
      clientType: session.clientType,
      requestId: input.requestId ?? null,
    });
    const seq = assistantMessage.seq;
    let streamed = '';
    let result: AnswerResult;

    try {
      result = await this.ai.answer({ question: text, history }, (token) => {
        streamed += token;
        emit({
          seq,
          type: 'token',
          role: 'assistant',
          text: token,
          final: false,
        });
      });
    } catch {
      result = {
        text: `I'm not sure right now. Please call the clinic at ${this.config.clinic.phone} or contact us at ${this.config.clinic.contactUrl}.`,
        citations: [],
        weakRetrieval: true,
        promptTokens: 0,
        completionTokens: 0,
      };
    }

    const finalText =
      result.text.trim() ||
      streamed.trim() ||
      `I'm not sure, please contact the clinic at ${this.config.clinic.phone}.`;

    if (!streamed) {
      emit({
        seq,
        type: 'token',
        role: 'assistant',
        text: finalText,
        final: false,
      });
    }

    // Persist the complete answer before signalling completion.
    await this.messages.updateBody(
      assistantMessage.message.id,
      finalText,
      result.citations,
    );
    emit({ seq, type: 'token', role: 'assistant', text: '', final: true });
    if (result.citations.length > 0) {
      emit({ seq, type: 'citation', sources: result.citations });
    }
    emit({
      seq,
      type: 'done',
      messageSeq: seq,
      ...(result.citations.length > 0 ? { citations: result.citations } : {}),
    });

    if (result.promptTokens + result.completionTokens > 0) {
      await this.usage.record(result.promptTokens, result.completionTokens);
    }
    await this.sessions.touch(session.id);
  }

  private async relayToStaff(
    context: ResolvedChatSession,
    text: string,
    emit: ChatEmitter['emit'],
  ): Promise<void> {
    if (!this.provider.isConfigured()) {
      emit(this.error(0, WS_ERROR.PROVIDER_ERROR));
      return;
    }

    const thread = await this.providerThreads.findByConversation(
      context.conversationId,
      this.provider.provider,
    );
    if (!thread) {
      emit(this.error(0, WS_ERROR.PROVIDER_ERROR));
      return;
    }

    const ref: ProviderThreadRef = {
      provider: thread.provider,
      threadId: thread.providerThreadId,
      metadata: (thread.metadata as Record<string, unknown> | null) ?? {},
    };
    try {
      await this.provider.sendMessage(ref, `Visitor: ${text}`);
    } catch {
      emit(this.error(0, WS_ERROR.PROVIDER_ERROR));
    }
  }

  private async fixedResponse(
    context: ResolvedChatSession,
    text: string,
    input: SendChatMessageInput,
  ): Promise<void> {
    const message = await this.messages.append({
      sessionId: context.session.id,
      conversationId: context.conversationId,
      direction: 'outbound',
      senderType: 'bot',
      frameType: 'token',
      bodyText: text,
      clientType: context.session.clientType,
      requestId: input.requestId ?? null,
    });
    input.emit({
      seq: message.seq,
      type: 'token',
      role: 'assistant',
      text,
      final: true,
    });
    input.emit({ seq: message.seq, type: 'done', messageSeq: message.seq });
  }

  private error(seq: number, code: string, retryAfterMs?: number): ChatFrame {
    return {
      seq,
      type: 'error',
      code,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    };
  }
}
