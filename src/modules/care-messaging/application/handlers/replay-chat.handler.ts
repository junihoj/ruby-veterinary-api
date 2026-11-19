import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { MessageRepository } from '../../infrastructure/repositories/message.repository';
import type { ChatFrame, HandoffFrame } from '../dto/chat.frames';
import type { ChatMessageState, ResolvedChatSession } from '../dto/chat.types';

function ttlSince(
  context: ResolvedChatSession,
  config: AppConfig,
  now = Date.now(),
): Date {
  const ms =
    context.session.status === 'handoff'
      ? config.chat.handoffRetentionHours * 3_600_000
      : config.chat.sessionTtlMinutes * 60_000;
  return new Date(now - ms);
}

/**
 * WS replay: one `token` (final, full stored text) + `done` per missed
 * message; system/handoff/staff frames are reconstructed by type.
 */
@Injectable()
export class ReplayChatHandler {
  constructor(
    private readonly messages: MessageRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(
    context: ResolvedChatSession,
    afterSeq: number,
  ): Promise<ChatFrame[]> {
    const rows = await this.messages.replay(
      context.session.id,
      afterSeq,
      ttlSince(context, this.config),
    );
    const frames: ChatFrame[] = [];
    for (const row of rows) {
      frames.push(...this.toFrames(row));
    }
    return frames;
  }

  private toFrames(row: ChatMessageState): ChatFrame[] {
    if (row.frameType === 'system') {
      return [{ seq: row.seq, type: 'notice', text: row.bodyText }];
    }
    if (row.frameType === 'handoff') {
      return [{ seq: row.seq, type: 'handoff', ...this.handoffPayload(row) }];
    }
    if (row.frameType === 'staff_message') {
      return [
        {
          seq: row.seq,
          type: 'staff_message',
          text: row.bodyText,
          senderName: 'Clinic staff',
        },
      ];
    }
    const role =
      row.senderType === 'visitor' || row.senderType === 'owner'
        ? 'user'
        : 'assistant';
    return [
      { seq: row.seq, type: 'token', role, text: row.bodyText, final: true },
      {
        seq: row.seq,
        type: 'done',
        messageSeq: row.seq,
        ...(row.citations && row.citations.length > 0
          ? { citations: row.citations }
          : {}),
      },
    ];
  }

  private handoffPayload(
    row: ChatMessageState,
  ): Pick<HandoffFrame, 'state' | 'staffName'> {
    try {
      const parsed = JSON.parse(row.bodyText) as {
        state?: string;
        staffName?: string;
      };
      if (
        parsed.state === 'requested' ||
        parsed.state === 'accepted' ||
        parsed.state === 'closed'
      ) {
        return {
          state: parsed.state,
          ...(typeof parsed.staffName === 'string' && parsed.staffName
            ? { staffName: parsed.staffName }
            : {}),
        };
      }
    } catch {
      // fall through
    }
    return { state: 'requested' };
  }
}

export { ttlSince };
