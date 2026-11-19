import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ChatSessionAuthService } from '../application/services/chat-session-auth.service';
import type { ResolvedChatSession } from '../application/dto/chat.types';

export type ChatRequest = Request & {
  chatSession?: ResolvedChatSession;
  requestId?: string;
};

/** Resolves the chat session from the cookie or bearer token (ADR-0017). */
@Injectable()
export class ChatSessionGuard implements CanActivate {
  constructor(private readonly auth: ChatSessionAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ChatRequest>();
    req.chatSession = await this.auth.resolveHttp(req);
    return true;
  }
}
