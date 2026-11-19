import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { HandoverSession } from '../../../../generated/prisma/client';

@Injectable()
export class HandoverRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRequested(
    conversationId: string,
    provider: string,
    reason: string,
  ): Promise<HandoverSession> {
    return this.prisma.handoverSession.create({
      data: {
        conversationId,
        provider,
        requestedReason: reason,
        requestedAt: new Date(),
        status: 'requested',
      },
    });
  }

  async findOpen(
    conversationId: string,
    provider: string,
  ): Promise<HandoverSession | null> {
    return this.prisma.handoverSession.findFirst({
      where: {
        conversationId,
        provider,
        status: { in: ['requested', 'claimed'] },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async attachThread(id: string, providerThreadId: string): Promise<void> {
    await this.prisma.handoverSession.update({
      where: { id },
      data: { providerThreadId },
    });
  }

  async claim(id: string, claimedBy: string): Promise<boolean> {
    const result = await this.prisma.handoverSession.updateMany({
      where: { id, status: 'requested' },
      data: { status: 'claimed', claimedBy, claimedAt: new Date() },
    });
    return result.count === 1;
  }

  /**
   * First-claim-wins for provider-native staff (Telegram): `claimed_by` is a
   * cross-schema app-user UUID, so the external identity lives in provider
   * thread metadata instead.
   */
  async claimByProvider(id: string): Promise<boolean> {
    const result = await this.prisma.handoverSession.updateMany({
      where: { id, status: 'requested' },
      data: { status: 'claimed', claimedAt: new Date() },
    });
    return result.count === 1;
  }

  async resolve(id: string, reason: string): Promise<void> {
    const now = new Date();
    await this.prisma.handoverSession.update({
      where: { id },
      data: {
        status: 'resolved',
        resolvedAt: now,
        closedAt: now,
        closedReason: reason,
      },
    });
  }

  async findByThreadId(
    provider: string,
    providerThreadId: string,
  ): Promise<HandoverSession | null> {
    return this.prisma.handoverSession.findFirst({
      where: { provider, providerThreadId },
      orderBy: { requestedAt: 'desc' },
    });
  }
}
