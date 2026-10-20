import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { AuditRowInput } from './prescription-request.repository';

/**
 * pharmacy.rx_audit_log — insert-only audit trail (ADR-0012). Every staff
 * touch of prescription content appends a row; the append-only trigger
 * refuses UPDATE/DELETE at the database level.
 */
@Injectable()
export class RxAuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(row: AuditRowInput) {
    return this.prisma.rxAuditLog.create({
      data: {
        prescriptionRequestId: row.prescriptionRequestId,
        actorUserId: row.actorUserId,
        action: row.action,
        detailJson: row.detailJson
          ? (row.detailJson as Prisma.InputJsonValue)
          : undefined,
        requestId: row.requestId ?? undefined,
      },
    });
  }
}
