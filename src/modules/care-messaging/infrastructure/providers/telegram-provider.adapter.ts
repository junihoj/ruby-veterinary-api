import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import {
  MessagingProviderPort,
  ProviderRequestError,
  ProviderUnavailableError,
  type CreateProviderThreadInput,
  type ProviderThreadRef,
} from '../../application/ports/messaging-provider-port';

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

interface ForumTopicResult {
  message_thread_id: number;
  name?: string;
}

const MAX_TOPIC_NAME = 128;
const MAX_MESSAGE = 4_000;

/**
 * Telegram Bot API adapter. Forum topics are one-per-handoff conversation;
 * the topic id is the provider thread id and the group id is the chat id.
 *
 * The adapter is intentionally thin: every call is a single Bot API request
 * with a short timeout. Failures surface as `ProviderRequestError` so callers
 * can degrade to the clinic contact fallback instead of corrupting state.
 */
@Injectable()
export class TelegramProviderAdapter implements MessagingProviderPort {
  readonly provider = 'telegram';
  private readonly logger = new Logger(TelegramProviderAdapter.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.telegram);
  }

  async createThread(
    input: CreateProviderThreadInput,
  ): Promise<ProviderThreadRef> {
    const telegram = this.requireTelegram();
    const name = input.title.trim().slice(0, MAX_TOPIC_NAME) || 'Web chat';
    const topic = await this.call<ForumTopicResult>('createForumTopic', {
      chat_id: telegram.forumGroupId,
      name,
    });
    if (!topic?.message_thread_id) {
      throw new ProviderRequestError(
        'Telegram did not return a message_thread_id.',
        'createForumTopic',
      );
    }

    const thread: ProviderThreadRef = {
      provider: this.provider,
      threadId: String(topic.message_thread_id),
      metadata: {
        chat_id: telegram.forumGroupId,
        message_thread_id: topic.message_thread_id,
        name,
        session_id: input.sessionId,
        created_at: new Date().toISOString(),
      },
    };

    if (input.intro?.trim()) {
      try {
        await this.sendMessage(thread, input.intro);
      } catch (error) {
        // The topic exists; keep the mapping even if the intro was rejected.
        this.logger.warn(
          `Telegram intro message failed for topic ${thread.threadId}: ${(error as Error).message}`,
        );
      }
    }
    return thread;
  }

  async sendMessage(thread: ProviderThreadRef, text: string): Promise<void> {
    const telegram = this.requireTelegram();
    const chatId =
      this.metadataString(thread, 'chat_id') ?? telegram.forumGroupId;
    const messageThreadId =
      this.metadataString(thread, 'message_thread_id') ?? thread.threadId;

    await this.call('sendMessage', {
      chat_id: chatId,
      message_thread_id: Number(messageThreadId),
      text: text.slice(0, MAX_MESSAGE),
      disable_web_page_preview: true,
    });
  }

  async closeThread(thread: ProviderThreadRef): Promise<void> {
    const telegram = this.requireTelegram();
    const chatId =
      this.metadataString(thread, 'chat_id') ?? telegram.forumGroupId;
    const messageThreadId =
      this.metadataString(thread, 'message_thread_id') ?? thread.threadId;
    try {
      await this.call('closeForumTopic', {
        chat_id: chatId,
        message_thread_id: Number(messageThreadId),
      });
    } catch (error) {
      // A missing/already-closed topic must not fail the handoff close path.
      this.logger.warn(
        `closeForumTopic failed for thread ${thread.threadId}: ${(error as Error).message}`,
      );
    }
  }

  private requireTelegram() {
    if (!this.config.telegram) {
      throw new ProviderUnavailableError(
        'Telegram is not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_FORUM_GROUP_ID / TELEGRAM_WEBHOOK_SECRET).',
      );
    }
    return this.config.telegram;
  }

  private metadataString(
    thread: ProviderThreadRef,
    key: string,
  ): string | null {
    const value = thread.metadata[key];
    return typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : null;
  }

  private async call<T = unknown>(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<T> {
    const telegram = this.requireTelegram();
    const url = `${telegram.apiBaseUrl}/bot${telegram.botToken}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    }).catch((error: unknown) => {
      throw new ProviderRequestError(
        `Telegram ${method} request failed: ${(error as Error).message}`,
        method,
      );
    });

    const body = (await response
      .json()
      .catch(() => null)) as TelegramResponse<T> | null;
    if (!response.ok || !body?.ok) {
      throw new ProviderRequestError(
        `Telegram ${method} rejected: ${body?.description ?? response.statusText}`,
        method,
      );
    }
    return body.result as T;
  }
}
