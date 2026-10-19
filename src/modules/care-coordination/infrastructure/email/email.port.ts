/**
 * Outbound email port (ADR-0013). Owned by Care Coordination — form-alert
 * routing is its only send path today; other contexts that need mail declare
 * and own their own port per §10. The dev adapter prints to the console;
 * swapping in SMTP is an adapter change, never a handler change.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export abstract class EmailPort {
  abstract send(message: EmailMessage): Promise<void>;
}
