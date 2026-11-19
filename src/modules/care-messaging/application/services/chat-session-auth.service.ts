import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { ChatSessionRepository } from '../../infrastructure/repositories/chat-session.repository';
import { unauthorized } from '../errors';
import type { ResolvedChatSession } from '../dto/chat.types';

export type HandshakeResolution =
  | { ok: true; context: ResolvedChatSession }
  | { ok: false; reason: 'unauthorized' | 'expired' };

interface HandshakeAuth {
  token?: unknown;
  last_seen_seq?: unknown;
}

/**
 * Single session-auth path for HTTP + WebSocket (messaging-protocol.md
 * §ChatSessionGuard). Web: HttpOnly cookie. Mobile: bearer JWT (sub=sessionId)
 * or the opaque session/refresh token.
 */
@Injectable()
export class ChatSessionAuthService {
  constructor(
    private readonly sessions: ChatSessionRepository,
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  newOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async signAccessToken(sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: sessionId, typ: 'chat' },
      { secret: this.config.jwtAccessSecret, expiresIn: 1_800 },
    );
  }

  async resolveHttp(req: Request): Promise<ResolvedChatSession> {
    const token = this.bearerToken(req) ?? this.cookieToken(req.headers.cookie);
    const context = await this.resolveToken(token);
    if (!context || this.usability(context) !== 'ok') {
      throw unauthorized();
    }
    return context;
  }

  async resolveHandshake(
    cookieHeader: string | undefined,
    auth: HandshakeAuth | undefined,
  ): Promise<HandshakeResolution> {
    const authToken =
      typeof auth?.token === 'string' && auth.token.length > 0
        ? auth.token
        : null;
    const token = authToken ?? this.cookieToken(cookieHeader);
    const context = await this.resolveToken(token);
    if (!context) return { ok: false, reason: 'unauthorized' };
    if (this.usability(context) !== 'ok') {
      return { ok: false, reason: 'expired' };
    }
    return { ok: true, context };
  }

  bearerToken(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }

  private async resolveToken(
    token: string | null,
  ): Promise<ResolvedChatSession | null> {
    if (!token) return null;

    if (token.split('.').length === 3) {
      const sessionId = await this.verifyAccessToken(token);
      if (!sessionId) return null;
      const session = await this.sessions.findById(sessionId);
      return session
        ? { session, conversationId: session.conversationId }
        : null;
    }

    const session = await this.sessions.findByTokenHash(this.hashToken(token));
    return session ? { session, conversationId: session.conversationId } : null;
  }

  private async verifyAccessToken(token: string): Promise<string | null> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub?: string;
        typ?: string;
      }>(token, { secret: this.config.jwtAccessSecret });
      if (payload.typ !== 'chat' || !payload.sub) return null;
      return payload.sub;
    } catch {
      return null;
    }
  }

  private usability(context: ResolvedChatSession): 'ok' | 'expired' {
    if (context.session.status === 'expired') return 'expired';
    if (context.session.status === 'closed') return 'expired';
    if (context.session.expiresAt.getTime() <= Date.now()) return 'expired';
    return 'ok';
  }

  private cookieToken(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
      const [name, ...rest] = part.trim().split('=');
      if (name === 'rv_chat_session') {
        return decodeURIComponent(rest.join('='));
      }
    }
    return null;
  }

  sessionCookie(
    token: string,
    maxAgeSeconds: number,
  ): {
    name: string;
    value: string;
    options: {
      httpOnly: boolean;
      sameSite: 'lax';
      path: string;
      secure: boolean;
      maxAge: number;
    };
  } {
    return {
      name: 'rv_chat_session',
      value: token,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/api',
        secure: this.config.nodeEnv === 'production',
        maxAge: maxAgeSeconds * 1_000,
      },
    };
  }
}
