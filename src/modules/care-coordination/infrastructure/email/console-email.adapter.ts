import { Injectable } from '@nestjs/common';
import { EmailMessage, EmailPort } from './email.port';

/**
 * Console email adapter (ADR-0013 — "Email: SMTP behind one interface").
 * Prints the message to stdout so dev and test environments exercise the
 * full alert path without an SMTP provider. Success is success: the alert
 * row flips to delivered exactly as it would against a real provider.
 */
@Injectable()
export class ConsoleEmailAdapter implements EmailPort {
  send(message: EmailMessage): Promise<void> {
    process.stdout.write(
      `[email:console] To: ${message.to}\n` +
        `Subject: ${message.subject}\n\n` +
        `${message.text}\n` +
        '----------\n',
    );
    return Promise.resolve();
  }
}
