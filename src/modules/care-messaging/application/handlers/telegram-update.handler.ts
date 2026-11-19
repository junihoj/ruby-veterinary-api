import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import type {
  HandoverSession,
  ProviderThread,
} from '../../../../generated/prisma/client';
import { ChatSessionRepository } from '../../infrastructure/repositories/chat-session.repository';
import { ConversationRepository } from '../../infrastructure/repositories/conversation.repository';
import { HandoverRepository } from '../../infrastructure/repositories/handover.repository';
import { MessageRepository } from '../../infrastructure/repositories/message.repository';
import { ProviderThreadRepository } from '../../infrastructure/repositories/provider-thread.repository';
import { WebhookUpdateRepository } from '../../infrastructure/repositories/webhook-update.repository';
import {
  MessagingProviderPort,
  type ProviderThreadRef,
} from '../ports/messaging-provider-port';
import { ChatGateway } from '../../infrastructure/gateway/chat.gateway';
import type { ChatSessionState } from '../dto/chat.types';

interface TelegramUser {
  id?: number | string;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id?: number;
  message_thread_id?: number;
  is_topic_message?: boolean;
  text?: string;
  chat?: { id?: number | string; type?: string };
  from?: TelegramUser;
}

interface TelegramUpdate {
  update_id?: number | string;
  message?: TelegramMessage;
}

const OPEN_STATES = new Set(['requested', 'claimed']);
const USAGE =
  'Commands: /claim — assign to yourself; /close — end the handoff; /note <text> — internal note.';

/**
 * Inbound Telegram update handler (api-specification §Telegram Webhook).
 * Updates are deduped before any side effect. Only forum-group topic messages
 * are processed; DMs and the General topic are ignored.
 */
@Injectable()
export class TelegramUpdateHandler {
  private readonly logger = new Logger(TelegramUpdateHandler.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly webhookUpdates: WebhookUpdateRepository,
    private readonly providerThreads: ProviderThreadRepository,
    private readonly handovers: HandoverRepository,
    private readonly sessions: ChatSessionRepository,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly gateway: ChatGateway,
    @Inject(MessagingProviderPort)
    private readonly provider: MessagingProviderPort,
  ) {}

  async execute(raw: unknown): Promise<void> {
    const update = raw as TelegramUpdate;
    if (!update || update.update_id === undefined) return;
    const updateId = String(update.update_id);

    const fresh = await this.webhookUpdates.tryRecord('telegram', updateId);
    if (!fresh) return;

    try {
      await this.dispatch(update);
    } catch (error) {
      // Drop the dedupe row so Telegram's retry is processed, not swallowed.
      await this.webhookUpdates.forget('telegram', updateId).catch(() => {});
      throw error;
    }
  }

  private async dispatch(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text || message.from?.is_bot) return;
    if (!this.config.telegram) return;
    if (String(message.chat?.id ?? '') !== this.config.telegram.forumGroupId) {
      return;
    }

    const threadId = message.message_thread_id;
    if (threadId === undefined) return;

    const thread = await this.providerThreads.findByProviderThreadId(
      'telegram',
      String(threadId),
    );
    if (!thread) return;

    const handover = await this.handovers.findByThreadId(
      'telegram',
      String(threadId),
    );
    const open = handover && OPEN_STATES.has(handover.status) ? handover : null;
    const text = message.text.trim();

    if (text.startsWith('/')) {
      await this.command(text, message, thread, open);
      return;
    }

    if (!open) {
      await this.reply(thread, 'No active handoff is linked to this topic.');
      return;
    }
    await this.bridgeStaffMessage(open, thread, message, text);
  }

  private async command(
    text: string,
    message: TelegramMessage,
    thread: ProviderThread,
    handover: HandoverSession | null,
  ): Promise<void> {
    const [rawCommand, ...rest] = text.split(/\s+/);
    const command = rawCommand.split('@')[0].toLowerCase();
    const staffName = this.staffName(message.from);

    if (command === '/claim') {
      if (!handover) {
        await this.reply(thread, 'No active handoff is linked to this topic.');
        return;
      }
      if (handover.status === 'claimed') {
        const claimer = this.claimedBy(thread);
        await this.reply(
          thread,
          claimer
            ? `Already claimed by ${claimer.name}.`
            : 'This handoff is already claimed.',
        );
        return;
      }

      const won = await this.handovers.claimByProvider(handover.id);
      if (!won) {
        const current = await this.handovers.findByThreadId(
          'telegram',
          thread.providerThreadId,
        );
        const claimer = current ? this.claimedBy(thread) : null;
        await this.reply(
          thread,
          claimer
            ? `Already claimed by ${claimer.name}.`
            : 'Another staff member claimed this handoff first.',
        );
        return;
      }

      await this.conversations.setStatus(
        handover.conversationId,
        'human_active',
      );
      await this.mergeMetadata(thread, {
        claimed_by: {
          id: String(message.from?.id ?? ''),
          name: staffName,
        },
        claimed_at: new Date().toISOString(),
      });

      const session = await this.sessions.findActiveByConversation(
        handover.conversationId,
        ['handoff'],
      );
      if (session) {
        await this.emitHandoff(session, 'accepted', staffName);
        await this.sessions.extendHandoff(session.id, this.handoffExpiry());
      }
      await this.reply(
        thread,
        `Claimed by ${staffName}. Messages you send here reach the visitor.`,
      );
      return;
    }

    if (command === '/close') {
      if (!handover) {
        await this.reply(thread, 'No active handoff is linked to this topic.');
        return;
      }
      const reason = rest.join(' ').trim() || 'staff_closed';
      await this.handovers.resolve(handover.id, reason);
      await this.conversations.setStatus(handover.conversationId, 'closed');

      const session = await this.sessions.findActiveByConversation(
        handover.conversationId,
        ['handoff'],
      );
      if (session) {
        await this.emitHandoff(session, 'closed');
        await this.sessions.markClosed(session.id);
      }
      await this.reply(
        thread,
        'Handoff closed. The visitor has been notified.',
      );
      await this.provider.closeThread(this.ref(thread));
      return;
    }

    if (command === '/note') {
      const note = rest.join(' ').trim();
      if (!note) {
        await this.reply(thread, 'Usage: /note <text>');
        return;
      }
      if (!handover) {
        await this.reply(thread, 'No active handoff is linked to this topic.');
        return;
      }
      const existing = this.metadata(thread).notes;
      const notes: unknown[] = Array.isArray(existing)
        ? existing.slice(-49)
        : [];
      await this.mergeMetadata(thread, {
        notes: [
          ...notes,
          { text: note, by: staffName, at: new Date().toISOString() },
        ],
      });
      await this.reply(
        thread,
        'Internal note saved (not sent to the visitor).',
      );
      return;
    }

    await this.reply(thread, USAGE);
  }

  private async bridgeStaffMessage(
    handover: HandoverSession,
    thread: ProviderThread,
    message: TelegramMessage,
    text: string,
  ): Promise<void> {
    const session = await this.sessions.findActiveByConversation(
      handover.conversationId,
      ['handoff'],
    );
    if (!session) {
      await this.reply(
        thread,
        "The visitor's chat has expired; this reply was not delivered.",
      );
      return;
    }

    const staffName = this.staffName(message.from);
    const stored = await this.messages.append({
      sessionId: session.id,
      conversationId: handover.conversationId,
      direction: 'outbound',
      senderType: 'staff',
      frameType: 'staff_message',
      bodyText: text,
      clientType: session.clientType,
    });
    this.gateway.broadcastToSession(session.id, {
      seq: stored.seq,
      type: 'staff_message',
      text,
      senderName: staffName,
    });

    if (handover.status === 'requested') {
      await this.conversations.setStatus(
        handover.conversationId,
        'human_active',
      );
    }
    await this.conversations.touchOutbound(handover.conversationId);
    await this.sessions.extendHandoff(session.id, this.handoffExpiry());

    // Acknowledge on the Telegram side so staff know the bridge delivered it.
    await this.reply(thread, 'Sent to the visitor.');
  }

  private async emitHandoff(
    session: ChatSessionState,
    state: 'accepted' | 'closed',
    staffName?: string,
  ): Promise<void> {
    const payload = {
      state,
      ...(staffName ? { staffName } : {}),
    };
    const stored = await this.messages.append({
      sessionId: session.id,
      conversationId: session.conversationId,
      direction: 'outbound',
      senderType: 'system',
      frameType: 'handoff',
      bodyText: JSON.stringify(payload),
      clientType: session.clientType,
    });
    this.gateway.broadcastToSession(session.id, {
      seq: stored.seq,
      type: 'handoff',
      ...payload,
    });
  }

  private async reply(thread: ProviderThread, text: string): Promise<void> {
    try {
      await this.provider.sendMessage(this.ref(thread), text);
    } catch (error) {
      this.logger.warn(
        `Telegram reply failed for thread ${thread.providerThreadId}: ${(error as Error).message}`,
      );
    }
  }

  private ref(thread: ProviderThread): ProviderThreadRef {
    return {
      provider: thread.provider,
      threadId: thread.providerThreadId,
      metadata: this.metadata(thread),
    };
  }

  private metadata(thread: ProviderThread): Record<string, unknown> {
    return (thread.metadata as Record<string, unknown> | null) ?? {};
  }

  private claimedBy(thread: ProviderThread): { name: string } | null {
    const value = this.metadata(thread).claimed_by;
    if (value && typeof value === 'object' && 'name' in value) {
      const name = (value as { name?: unknown }).name;
      if (typeof name === 'string' && name.length > 0) return { name };
    }
    return null;
  }

  private async mergeMetadata(
    thread: ProviderThread,
    patch: Record<string, unknown>,
  ): Promise<void> {
    await this.providerThreads.updateMetadata(thread.id, {
      ...this.metadata(thread),
      ...patch,
    });
  }

  private staffName(from: TelegramUser | undefined): string {
    const full = [from?.first_name, from?.last_name]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' ')
      .trim();
    if (full) return full;
    if (from?.username) return `@${from.username}`;
    return 'Clinic staff';
  }

  private handoffExpiry(): Date {
    return new Date(
      Date.now() + this.config.chat.handoffRetentionHours * 3_600_000,
    );
  }
}
