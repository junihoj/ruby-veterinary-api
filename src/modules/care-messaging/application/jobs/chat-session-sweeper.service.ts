import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import {
  ChatSessionRepository,
  type ExpiredChatSession,
} from '../../infrastructure/repositories/chat-session.repository';
import { HandoverRepository } from '../../infrastructure/repositories/handover.repository';
import { ProviderThreadRepository } from '../../infrastructure/repositories/provider-thread.repository';
import { WebhookUpdateRepository } from '../../infrastructure/repositories/webhook-update.repository';
import {
  MessagingProviderPort,
  type ProviderThreadRef,
} from '../ports/messaging-provider-port';

const WEBHOOK_RETENTION_MS = 7 * 24 * 3_600_000;

/**
 * `ChatSessionSweeper` (messaging-protocol.md §Session Lifecycle): every tick,
 * TTL-expired AI-only and handoff sessions lose their transcript and become
 * `expired`. Handoff rows resolve and forum topics close; provider webhook
 * dedupe rows older than 7 days are pruned. 0 disables the timer (e2e drives
 * `sweep()` explicitly).
 */
@Injectable()
export class ChatSessionSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatSessionSweeper.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly sessions: ChatSessionRepository,
    private readonly handovers: HandoverRepository,
    private readonly providerThreads: ProviderThreadRepository,
    private readonly webhookUpdates: WebhookUpdateRepository,
    @Inject(MessagingProviderPort)
    private readonly provider: MessagingProviderPort,
  ) {}

  onModuleInit(): void {
    const tick = this.config.chat.sweeperTickMs;
    if (tick <= 0) return;
    this.timer = setInterval(() => {
      void this.sweep();
    }, tick);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(now = new Date()): Promise<number> {
    let expired: ExpiredChatSession[] = [];
    try {
      expired = await this.sessions.sweep(now);
    } catch (error) {
      this.logger.error(
        `Chat session sweep failed: ${(error as Error).message}`,
      );
      return 0;
    }

    await this.cleanupHandoffs(expired);
    try {
      await this.webhookUpdates.prune(
        new Date(now.getTime() - WEBHOOK_RETENTION_MS),
      );
    } catch (error) {
      this.logger.warn(
        `Webhook dedupe prune failed: ${(error as Error).message}`,
      );
    }
    return expired.length;
  }

  private async cleanupHandoffs(expired: ExpiredChatSession[]): Promise<void> {
    const handoffSessions = expired.filter((session) => session.wasHandoff);
    if (handoffSessions.length === 0) return;

    await Promise.allSettled(
      handoffSessions.map(async (session) => {
        const open = await this.handovers.findOpen(
          session.conversationId,
          this.provider.provider,
        );
        if (open) {
          await this.handovers.resolve(open.id, 'expired');
        }
        if (!this.provider.isConfigured()) return;
        const thread = await this.providerThreads.findByConversation(
          session.conversationId,
          this.provider.provider,
        );
        if (!thread) return;
        const ref: ProviderThreadRef = {
          provider: thread.provider,
          threadId: thread.providerThreadId,
          metadata: (thread.metadata as Record<string, unknown> | null) ?? {},
        };
        await this.provider.closeThread(ref);
      }),
    );
  }
}
