import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { ChatSessionRepository } from '../../infrastructure/repositories/chat-session.repository';

/**
 * `ChatSessionSweeper` (messaging-protocol.md §Session Lifecycle): every tick,
 * TTL-expired AI-only and handoff sessions lose their transcript and become
 * `expired`. 0 disables the timer (e2e drives `sweep()` explicitly).
 */
@Injectable()
export class ChatSessionSweeper implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly sessions: ChatSessionRepository,
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
    try {
      return await this.sessions.sweep(now);
    } catch {
      return 0;
    }
  }
}
