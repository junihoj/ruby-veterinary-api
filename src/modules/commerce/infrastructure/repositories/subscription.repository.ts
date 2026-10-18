import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Subscription auto-refill persistence (commerce.md subscriptions, M3b).
 * Physical simple/variable only — that guard lives in the create handler;
 * this repository owns due-row claiming and schedule advancement.
 */
@Injectable()
export class SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByUser(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      include: {
        product: { select: { id: true, name: true, slug: true } },
        variant: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async findOwned(userId: string, subscriptionId: string) {
    return this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: {
        product: { select: { id: true, name: true, slug: true } },
        variant: { select: { id: true, name: true } },
      },
    });
  }

  async create(data: {
    userId: string;
    productId: string;
    variantId: string;
    petId: string | null;
    frequency: string;
    nextOrderAt: Date;
  }) {
    return this.prisma.subscription.create({
      data,
      include: {
        product: { select: { id: true, name: true, slug: true } },
        variant: { select: { id: true, name: true } },
      },
    });
  }

  /** Conditional update (unknown/foreign rows simply match nothing). */
  async updateOwned(
    userId: string,
    subscriptionId: string,
    data: { status?: string; cancelReason?: string | null },
  ) {
    const result = await this.prisma.subscription.updateMany({
      where: { id: subscriptionId, userId },
      data,
    });
    return result.count === 1;
  }

  /**
   * Due active rows for one timer tick. Claiming is *not* done here — the
   * tick claims each row with a conditional `next_order_at` advance so a
   * concurrent tick can never double-order the same due date.
   */
  async listDue(limit: number, now: Date) {
    return this.prisma.subscription.findMany({
      where: { status: 'active', nextOrderAt: { lte: now } },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            requiresPrescription: true,
          },
        },
        variant: {
          select: {
            id: true,
            name: true,
            price: true,
            active: true,
          },
        },
      },
      orderBy: { nextOrderAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Claim one due row: succeeds only when the row is still active and still
   * points at the due date the tick read (a concurrent tick or a user cancel
   * wins otherwise). Returns false when the claim was lost.
   */
  async claimDue(
    subscriptionId: string,
    dueAt: Date,
    advancedTo: Date,
  ): Promise<boolean> {
    const result = await this.prisma.subscription.updateMany({
      where: { id: subscriptionId, status: 'active', nextOrderAt: dueAt },
      data: { nextOrderAt: advancedTo },
    });
    return result.count === 1;
  }

  /** Restore a claimed window after a failed place (gateway down). */
  async reclaim(
    subscriptionId: string,
    claimedTo: Date,
    dueAt: Date,
  ): Promise<void> {
    await this.prisma.subscription.updateMany({
      where: { id: subscriptionId, status: 'active', nextOrderAt: claimedTo },
      data: { nextOrderAt: dueAt },
    });
  }

  async pause(subscriptionId: string): Promise<void> {
    await this.prisma.subscription.updateMany({
      where: { id: subscriptionId, status: 'active' },
      data: { status: 'paused' },
    });
  }
}
