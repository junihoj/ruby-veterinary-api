import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * intake.intake_submissions persistence. `create` links the submission's
 * pending history uploads atomically (the owner references them at submit
 * time — care-coordination.md "exactly one parent"): the link UPDATE re-checks
 * pending/no-parent in the same transaction, so an upload already claimed by
 * a concurrent submission aborts the whole create.
 *
 * `claimAcceptance` is the accept-flow mutex: a conditional status change
 * from received/in_review to accepted whose row count tells the caller
 * whether it won the right to file the client (there is no cross-schema
 * transaction between intake and clients).
 */
@Injectable()
export class IntakeSubmissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: {
      userId: string | null;
      contactName: string;
      contactPhone: string;
      contactEmail: string;
      addressLine1: string | null;
      addressLine2: string | null;
      city: string | null;
      postalCode: string | null;
      country: string | null;
      existingClient: boolean;
      preferredVetUserId: string | null;
      notes: string | null;
    },
    uploadIds: string[],
  ) {
    if (uploadIds.length === 0) {
      return this.prisma.intakeSubmission.create({
        data: { ...input, status: 'received' },
        include: { uploads: { select: { id: true } } },
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const submission = await tx.intakeSubmission.create({
        data: { ...input, status: 'received' },
        include: { uploads: { select: { id: true } } },
      });
      const linked = await tx.historyUpload.updateMany({
        where: {
          id: { in: uploadIds },
          status: 'pending',
          appointmentRequestId: null,
          intakeSubmissionId: null,
        },
        data: { intakeSubmissionId: submission.id },
      });
      if (linked.count !== uploadIds.length) {
        throw new Error('INTAKE_UPLOAD_LINK_CONFLICT');
      }
      return tx.intakeSubmission.findUniqueOrThrow({
        where: { id: submission.id },
        include: { uploads: { select: { id: true } } },
      });
    });
  }

  async findById(id: string) {
    return this.prisma.intakeSubmission.findUnique({
      where: { id },
      include: { uploads: { select: { id: true } } },
    });
  }

  /** Owner-scoped read for GET /clients/intake/{id}/status. */
  async findByIdForOwner(id: string, userId: string) {
    return this.prisma.intakeSubmission.findFirst({
      where: { id, userId },
      select: { id: true, status: true },
    });
  }

  async list(status: string | null, limit: number, cursor?: string) {
    return this.prisma.intakeSubmission.findMany({
      where: status ? { status } : undefined,
      include: { uploads: { select: { id: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.intakeSubmission.update({
      where: { id },
      data: { status },
      include: { uploads: { select: { id: true } } },
    });
  }

  /** Conditional accept claim; count 0 means a concurrent accept won. */
  async claimAcceptance(id: string, fromStatuses: string[]): Promise<boolean> {
    const claimed = await this.prisma.intakeSubmission.updateMany({
      where: { id, status: { in: fromStatuses } },
      data: { status: 'accepted' },
    });
    return claimed.count === 1;
  }

  /** Revert a failed acceptance so the staff can retry (see accept handler). */
  async revertStatus(id: string, status: string): Promise<void> {
    await this.prisma.intakeSubmission.update({
      where: { id },
      data: { status },
    });
  }
}
