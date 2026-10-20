import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * pharmacy.prescription_decisions — insert-only read side (rows are written
 * inside PrescriptionRequestRepository.recordDecision's transaction; the
 * append-only trigger refuses UPDATE/DELETE at the database level, ADR-0012).
 */
@Injectable()
export class PrescriptionDecisionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByRequest(requestId: string) {
    return this.prisma.prescriptionDecision.findMany({
      where: { prescriptionRequestId: requestId },
      orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
    });
  }
}
