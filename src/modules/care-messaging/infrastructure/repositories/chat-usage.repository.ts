import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface UsageSnapshot {
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

@Injectable()
export class ChatUsageRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private today(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  async snapshot(): Promise<UsageSnapshot> {
    const row = await this.prisma.chatUsageDaily.findUnique({
      where: { day: this.today() },
    });
    if (!row) {
      return {
        requests: 0,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
      };
    }
    return {
      requests: row.requests,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      costUsd: Number(row.costUsd),
    };
  }

  async isCapReached(): Promise<boolean> {
    const usage = await this.snapshot();
    return (
      usage.requests >= this.config.chat.dailyRequestCap ||
      usage.promptTokens + usage.completionTokens >=
        this.config.chat.dailyTokenCap
    );
  }

  async record(promptTokens: number, completionTokens: number): Promise<void> {
    const day = this.today();
    // gpt-4o-mini public pricing (USD/token): $0.15/M in, $0.60/M out.
    const costUsd =
      Math.round(
        (promptTokens * 0.00000015 + completionTokens * 0.0000006) * 1e6,
      ) / 1e6;
    await this.prisma.chatUsageDaily.upsert({
      where: { day },
      create: {
        day,
        requests: 1,
        promptTokens,
        completionTokens,
        costUsd,
      },
      update: {
        requests: { increment: 1 },
        promptTokens: { increment: promptTokens },
        completionTokens: { increment: completionTokens },
        costUsd: { increment: costUsd },
      },
    });
  }
}
