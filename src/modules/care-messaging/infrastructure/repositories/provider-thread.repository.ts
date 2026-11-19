import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '../../../../generated/prisma/client';
import type { ProviderThread } from '../../../../generated/prisma/client';

@Injectable()
export class ProviderThreadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByConversation(
    conversationId: string,
    provider: string,
  ): Promise<ProviderThread | null> {
    return this.prisma.providerThread.findUnique({
      where: { conversationId_provider: { conversationId, provider } },
    });
  }

  async findByProviderThreadId(
    provider: string,
    providerThreadId: string,
  ): Promise<ProviderThread | null> {
    return this.prisma.providerThread.findUnique({
      where: { provider_providerThreadId: { provider, providerThreadId } },
    });
  }

  async updateMetadata(
    id: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.providerThread.update({
      where: { id },
      data: { metadata: metadata as Prisma.InputJsonValue },
    });
  }

  async upsert(
    conversationId: string,
    provider: string,
    providerThreadId: string,
    metadata?: Record<string, unknown>,
  ): Promise<ProviderThread> {
    return this.prisma.providerThread.upsert({
      where: { conversationId_provider: { conversationId, provider } },
      create: {
        conversationId,
        provider,
        providerThreadId,
        ...(metadata
          ? { metadata: metadata as unknown as Prisma.InputJsonValue }
          : {}),
      },
      update: {
        providerThreadId,
        ...(metadata
          ? { metadata: metadata as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }
}
