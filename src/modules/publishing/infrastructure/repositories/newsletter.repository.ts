import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/** publishing.newsletter_subscribers persistence (subscribe-only in M7). */
@Injectable()
export class NewsletterRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.newsletterSubscriber.findUnique({ where: { email } });
  }

  create(data: {
    email: string;
    status: 'pending';
    consentedAt: Date;
    source: string | null;
  }) {
    return this.prisma.newsletterSubscriber.create({ data });
  }

  reactivate(id: string, source: string | null) {
    return this.prisma.newsletterSubscriber.update({
      where: { id },
      data: {
        status: 'pending',
        consentedAt: new Date(),
        confirmedAt: null,
        source,
      },
    });
  }
}
