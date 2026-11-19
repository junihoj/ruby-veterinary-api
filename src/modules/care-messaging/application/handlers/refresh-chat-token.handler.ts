import { Injectable } from '@nestjs/common';
import { ChatSessionRepository } from '../../infrastructure/repositories/chat-session.repository';
import { ChatSessionAuthService } from '../services/chat-session-auth.service';
import type { ResolvedChatSession } from '../dto/chat.types';

export interface RefreshTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Rotates the opaque refresh token (single use) and issues a new access JWT. */
@Injectable()
export class RefreshChatTokenHandler {
  constructor(
    private readonly sessions: ChatSessionRepository,
    private readonly auth: ChatSessionAuthService,
  ) {}

  async execute(context: ResolvedChatSession): Promise<RefreshTokenResult> {
    const refreshToken = this.auth.newOpaqueToken();
    await this.sessions.rotateToken(
      context.session.id,
      this.auth.hashToken(refreshToken),
    );
    return {
      accessToken: await this.auth.signAccessToken(context.session.id),
      refreshToken,
      expiresIn: 1_800,
    };
  }
}
