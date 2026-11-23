import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '../../../../generated/prisma/client';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { SubscribeNewsletterCommand } from '../commands/subscribe-newsletter.command';
import { NewsletterSubscriptionDto } from '../dto/publishing.responses.dto';
import { NewsletterSubscribed } from '../events/newsletter-subscribed.event';
import { NewsletterRepository } from '../../infrastructure/repositories/newsletter.repository';

@CommandHandler(SubscribeNewsletterCommand)
export class SubscribeNewsletterHandler implements ICommandHandler<SubscribeNewsletterCommand> {
  constructor(
    private readonly subscribers: NewsletterRepository,
    private readonly events: IntegrationEventPublisher,
  ) {}

  async execute(
    command: SubscribeNewsletterCommand,
  ): Promise<NewsletterSubscriptionDto> {
    const email = command.input.email.trim().toLowerCase();
    const source = command.input.source ?? null;
    const existing = await this.subscribers.findByEmail(email);

    if (existing) {
      if (existing.status !== 'unsubscribed') {
        return { email: existing.email, status: existing.status };
      }
      const row = await this.subscribers.reactivate(existing.id, source);
      this.raise(row.id, source);
      return { email: row.email, status: row.status };
    }

    try {
      const row = await this.subscribers.create({
        email,
        status: 'pending',
        consentedAt: new Date(),
        source,
      });
      this.raise(row.id, source);
      return { email: row.email, status: row.status };
    } catch (error) {
      // Concurrent duplicate: the unique email constraint wins; return the
      // row that landed first without creating a second event.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const row = await this.subscribers.findByEmail(email);
        if (row) return { email: row.email, status: row.status };
      }
      throw error;
    }
  }

  private raise(id: string, source: string | null): void {
    this.events.publish(
      new NewsletterSubscribed({
        subscriberId: PrefixedId.format('newsletterSubscriber', id),
        source,
      }),
    );
  }
}
