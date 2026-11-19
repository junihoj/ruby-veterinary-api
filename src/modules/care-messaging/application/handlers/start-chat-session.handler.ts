import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { ChatSessionRepository } from '../../infrastructure/repositories/chat-session.repository';
import { ConversationRepository } from '../../infrastructure/repositories/conversation.repository';
import { MessageRepository } from '../../infrastructure/repositories/message.repository';
import { ChatSessionAuthService } from '../services/chat-session-auth.service';
import { CHAT_NOTICE } from '../services/safe-responses';
import type { StartSessionInput, StartSessionResult } from '../dto/chat.types';

@Injectable()
export class StartChatSessionHandler {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly sessions: ChatSessionRepository,
    private readonly messages: MessageRepository,
    private readonly auth: ChatSessionAuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(input: StartSessionInput): Promise<StartSessionResult> {
    const conversation = await this.conversations.findOrCreate(
      'web_chat',
      `chat:${randomUUID()}`,
      input.contactName ?? null,
    );

    const token = this.auth.newOpaqueToken();
    const expiresAt = new Date(
      Date.now() + this.config.chat.sessionTtlMinutes * 60_000,
    );
    const session = await this.sessions.create({
      tokenHash: this.auth.hashToken(token),
      clientType: input.clientType,
      conversationId: conversation.id,
      expiresAt,
    });

    // `notice` is seq 1 and is replayed from the transcript on every connect.
    await this.messages.append({
      sessionId: session.id,
      conversationId: conversation.id,
      direction: 'outbound',
      senderType: 'system',
      frameType: 'system',
      bodyText: CHAT_NOTICE,
      clientType: input.clientType,
    });

    const result: StartSessionResult = {
      sessionId: session.id,
      token,
      seq: 0,
      expiresAt,
    };

    if (input.clientType === 'mobile') {
      result.accessToken = await this.auth.signAccessToken(session.id);
      result.refreshToken = token;
      result.expiresIn = 1_800;
    }

    return result;
  }
}
