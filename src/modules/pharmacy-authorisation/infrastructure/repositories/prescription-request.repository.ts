import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

/** Decision rows are insert-only (DB trigger, ADR-0012). */
export interface DecisionRowInput {
  prescriptionRequestId: string;
  decision: 'approve' | 'reject' | 'query';
  reasonCode: string | null;
  reasonText: string | null;
  decidedBy: string;
  decidedAt: Date;
}

export interface AuditRowInput {
  prescriptionRequestId: string;
  actorUserId: string;
  action: 'viewed' | 'decision_recorded' | 'queue_claimed' | 'exported';
  detailJson?: Record<string, unknown> | null;
  /** API requestId correlation (nullable outside HTTP). */
  requestId?: string | null;
}

/**
 * pharmacy.prescription_requests persistence. `recordDecision` is the
 * ADR-0012 unit: guarded status claim + decision row + audit row in ONE
 * transaction — the claim's row count tells the caller whether it won the
 * decision (a terminal or concurrently decided request answers 409).
 */
@Injectable()
export class PrescriptionRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(uuid: string) {
    return this.prisma.prescriptionRequest.findUnique({
      where: { id: uuid },
    });
  }

  async findByOrder(orderId: string) {
    return this.prisma.prescriptionRequest.findMany({
      where: { orderId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Checkout hold: one pending request per order + pet group. */
  async create(input: {
    orderId: string;
    orderItemIds: string[];
    userId: string;
    petId: string;
    veterinarianUserId: string;
    ownerNote: string | null;
  }) {
    return this.prisma.prescriptionRequest.create({
      data: {
        orderId: input.orderId,
        orderItemIds: input.orderItemIds,
        userId: input.userId,
        petId: input.petId,
        veterinarianUserId: input.veterinarianUserId,
        ownerNote: input.ownerNote,
        status: 'pending',
      },
    });
  }

  /** Staff review queue (ix_rx_requests_queue): open states, newest first. */
  async listOpen(
    status: 'pending' | 'queried' | null,
    limit: number,
    cursor?: string,
  ) {
    return this.prisma.prescriptionRequest.findMany({
      where: { status: status ?? { in: ['pending', 'queried'] } },
      orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  /**
   * Claim the transition and append the decision + audit rows atomically.
   * Returns false when the request is terminal or moved concurrently —
   * the handler maps that to 409 STATE_CONFLICT.
   */
  async recordDecision(input: {
    requestId: string;
    allowedFrom: string[];
    to: string;
    decision: DecisionRowInput;
    audit: AuditRowInput;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.prescriptionRequest.updateMany({
        where: { id: input.requestId, status: { in: input.allowedFrom } },
        data: {
          status: input.to,
          decidedAt: input.decision.decidedAt,
          decidedBy: input.decision.decidedBy,
        },
      });
      if (claimed.count === 0) return false;

      await tx.prescriptionDecision.create({ data: input.decision });
      await tx.rxAuditLog.create({
        data: {
          prescriptionRequestId: input.audit.prescriptionRequestId,
          actorUserId: input.audit.actorUserId,
          action: input.audit.action,
          detailJson: input.audit.detailJson
            ? (input.audit.detailJson as Prisma.InputJsonValue)
            : undefined,
          requestId: input.audit.requestId ?? undefined,
        },
      });
      return true;
    });
  }

  /**
   * Rejection cancels the order (commerce consumes the event) — sibling open
   * requests of the same order are cancelled too, so the order never keeps a
   * live hold. Uses the documented `cancelled` status (enum member, no API).
   */
  async cancelSiblings(requestId: string, orderId: string): Promise<number> {
    const cancelled = await this.prisma.prescriptionRequest.updateMany({
      where: {
        orderId,
        id: { not: requestId },
        status: { in: ['pending', 'queried'] },
      },
      data: { status: 'cancelled' },
    });
    return cancelled.count;
  }

  async countByOrderAndStatus(orderId: string, status: string) {
    return this.prisma.prescriptionRequest.count({
      where: { orderId, status },
    });
  }

  async countByOrder(orderId: string) {
    return this.prisma.prescriptionRequest.count({ where: { orderId } });
  }
}
