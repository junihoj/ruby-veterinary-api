import type { CitationDto } from '../../../ai-assistant/application/ports/ai-assistant-port';

export interface TokenFrame {
  seq: number;
  type: 'token';
  role: 'user' | 'assistant';
  text: string;
  final: boolean;
}

export interface CitationFrame {
  seq: number;
  type: 'citation';
  sources: CitationDto[];
}

export interface DoneFrame {
  seq: number;
  type: 'done';
  messageSeq: number;
  citations?: CitationDto[];
}

export interface ErrorFrame {
  seq: number;
  type: 'error';
  code: string;
  retryAfterMs?: number;
}

export interface HandoffFrame {
  seq: number;
  type: 'handoff';
  state: 'requested' | 'accepted' | 'closed';
  staffName?: string;
}

export interface StaffMessageFrame {
  seq: number;
  type: 'staff_message';
  text: string;
  senderName?: string;
}

export interface NoticeFrame {
  seq: number;
  type: 'notice';
  text: string;
}

export interface ExpiredFrame {
  seq: number;
  type: 'expired';
  contact: {
    phone: string;
    formUrl: string;
    bookingUrl: string;
  };
}

export type ChatFrame =
  | TokenFrame
  | CitationFrame
  | DoneFrame
  | ErrorFrame
  | HandoffFrame
  | StaffMessageFrame
  | NoticeFrame
  | ExpiredFrame;

/** The gateway fans frames out to the session room by `frame.type`. */
export interface ChatEmitter {
  emit(frame: ChatFrame): void;
}
