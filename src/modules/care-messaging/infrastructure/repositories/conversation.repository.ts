import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface ConversationState {
  id: string;
  status: string;
}

@Injectable()
export class ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(
    channel: string,
    contactIdentity: string,
    contactName?: string | null,
  ): Promise<ConversationState> {
    const now = new Date();
    return this.prisma.conversation.upsert({
      where: { channel_contactIdentity: { channel, contactIdentity } },
      create: {
        channel,
        contactIdentity,
        contactName: contactName ?? null,
        direction: 'inbound',
        status: 'bot_active',
        lastInboundAt: now,
      },
      update: {
        lastInboundAt: now,
        ...(contactName ? { contactName } : {}),
      },
      select: { id: true, status: true },
    });
  }

  async setStatus(id: string, status: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id },
      data: { status },
    });
  }

  async touchInbound(id: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id },
      data: { lastInboundAt: new Date() },
    });
  }

  async touchOutbound(id: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id },
      data: { lastOutboundAt: new Date() },
    });
  }
}
