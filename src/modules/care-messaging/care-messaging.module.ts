import { Module } from '@nestjs/common';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { CareMessagingFacade } from './application/facades/care-messaging-facade';
import { CareMessagingFacadePort } from './application/facades/care-messaging-facade-port';
import { StartChatSessionHandler } from './application/handlers/start-chat-session.handler';
import { RefreshChatTokenHandler } from './application/handlers/refresh-chat-token.handler';
import { ReplayChatHandler } from './application/handlers/replay-chat.handler';
import { ListChatMessagesHandler } from './application/handlers/list-chat-messages.handler';
import { SendChatMessageHandler } from './application/handlers/send-chat-message.handler';
import { RequestChatHandoffHandler } from './application/handlers/request-chat-handoff.handler';
import { TelegramUpdateHandler } from './application/handlers/telegram-update.handler';
import { MessagingProviderPort } from './application/ports/messaging-provider-port';
import { ChatSessionSweeper } from './application/jobs/chat-session-sweeper.service';
import { ChatSessionAuthService } from './application/services/chat-session-auth.service';
import { ChatRateLimiter } from './application/services/rate-limiter.service';
import { MessageClassifierService } from './application/services/message-classifier.service';
import { ChatGateway } from './infrastructure/gateway/chat.gateway';
import { BotRuleRepository } from './infrastructure/repositories/bot-rule.repository';
import { ChatSessionRepository } from './infrastructure/repositories/chat-session.repository';
import { ChatUsageRepository } from './infrastructure/repositories/chat-usage.repository';
import { ConversationRepository } from './infrastructure/repositories/conversation.repository';
import { HandoverRepository } from './infrastructure/repositories/handover.repository';
import { MessageRepository } from './infrastructure/repositories/message.repository';
import { ProviderThreadRepository } from './infrastructure/repositories/provider-thread.repository';
import { WebhookUpdateRepository } from './infrastructure/repositories/webhook-update.repository';
import { TelegramProviderAdapter } from './infrastructure/providers/telegram-provider.adapter';
import { ChatController } from './presentation/chat.controller';
import { ChatSessionGuard } from './presentation/chat-session.guard';
import { TelegramWebhookController } from './presentation/webhooks/telegram.webhook.controller';

/**
 * CareMessaging bounded context (schema: messaging) — M6a hybrid chat + M6b
 * Telegram staff handoff. Owns web/mobile sessions, the Socket.IO transport,
 * deterministic safety classification, RAG answer orchestration, session
 * expiry, and the provider-swappable handoff bridge.
 */
@Module({
  imports: [AiAssistantModule],
  controllers: [ChatController, TelegramWebhookController],
  providers: [
    ConversationRepository,
    ChatSessionRepository,
    MessageRepository,
    ChatUsageRepository,
    BotRuleRepository,
    HandoverRepository,
    ProviderThreadRepository,
    WebhookUpdateRepository,
    ChatSessionAuthService,
    ChatRateLimiter,
    MessageClassifierService,
    StartChatSessionHandler,
    RefreshChatTokenHandler,
    ReplayChatHandler,
    ListChatMessagesHandler,
    SendChatMessageHandler,
    RequestChatHandoffHandler,
    TelegramUpdateHandler,
    TelegramProviderAdapter,
    {
      provide: MessagingProviderPort,
      useExisting: TelegramProviderAdapter,
    },
    ChatSessionSweeper,
    ChatSessionGuard,
    ChatGateway,
    CareMessagingFacade,
    { provide: CareMessagingFacadePort, useExisting: CareMessagingFacade },
  ],
  exports: [CareMessagingFacadePort],
})
export class CareMessagingModule {}
