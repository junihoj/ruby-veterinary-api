import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Durable provider-webhook dedupe (Telegram retries updates until acked).
 * `update_id` is stored as text: Telegram ids are bigint and must not lose
 * precision through a JS number.
 */
@Injectable()
export class WebhookUpdateRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** True when this provider update id was seen for the first time. */
  async tryRecord(provider: string, updateId: string): Promise<boolean> {
    try {
      await this.prisma.webhookUpdate.create({
        data: { provider, updateId },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  /** Best-effort retention trim; failures never affect webhook delivery. */
  async prune(olderThan: Date): Promise<number> {
    const result = await this.prisma.webhookUpdate.deleteMany({
      where: { receivedAt: { lt: olderThan } },
    });
    return result.count;
  }

  /**
   * Removes a recorded update so Telegram's retry can be processed after a
   * transient failure (otherwise the retry would be deduped and lost).
   */
  async forget(provider: string, updateId: string): Promise<void> {
    await this.prisma.webhookUpdate.deleteMany({
      where: { provider, updateId },
    });
  }
}
