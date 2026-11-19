import type { CitationDto } from '../../../ai-assistant/application/ports/ai-assistant-port';

/** Session shape used inside the context (never a Prisma row leaked out). */
export interface ChatSessionState {
  id: string;
  conversationId: string;
  clientType: string;
  status: string;
  lastSeq: number;
  expiresAt: Date;
  handoffStartedAt: Date | null;
  lastActivityAt: Date;
}

export interface ChatMessageState {
  id: string;
  seq: number;
  direction: string;
  senderType: string;
  frameType: string;
  bodyText: string;
  citations: CitationDto[] | null;
  createdAt: Date;
}

export interface ResolvedChatSession {
  session: ChatSessionState;
  conversationId: string;
}

export interface StartSessionInput {
  clientType: 'web' | 'mobile';
  contactName?: string | null;
  userAgent?: string | null;
}

export interface StartSessionResult {
  sessionId: string;
  token: string;
  seq: number;
  expiresAt: Date;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface AppendChatMessageInput {
  sessionId: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  senderType: 'visitor' | 'owner' | 'bot' | 'staff' | 'system';
  frameType: 'token' | 'staff_message' | 'handoff' | 'system';
  bodyText: string;
  clientType?: string | null;
  citations?: CitationDto[] | null;
  requestId?: string | null;
}
