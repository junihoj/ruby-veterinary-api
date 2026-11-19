/**
 * Provider-swappable staff-handoff port (ADR-0017). Telegram is the first
 * adapter; WhatsApp can slot in without touching the messaging context.
 *
 * The adapter owns provider API shape only. Conversation/session state,
 * handover lifecycle, and the web-chat transcript stay in this context.
 */
export interface ProviderThreadRef {
  provider: string;
  threadId: string;
  metadata: Record<string, unknown>;
}

export interface CreateProviderThreadInput {
  conversationId: string;
  sessionId: string;
  title: string;
  /** Posted into the new thread after creation (visitor context, commands). */
  intro?: string;
}

export class ProviderUnavailableError extends Error {
  constructor(message = 'Messaging provider is not configured.') {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly method: string,
  ) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

export abstract class MessagingProviderPort {
  abstract readonly provider: string;

  /** False when the provider's server-side secrets are absent. */
  abstract isConfigured(): boolean;

  abstract createThread(
    input: CreateProviderThreadInput,
  ): Promise<ProviderThreadRef>;

  abstract sendMessage(thread: ProviderThreadRef, text: string): Promise<void>;

  abstract closeThread(thread: ProviderThreadRef): Promise<void>;
}
