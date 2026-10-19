import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/** intake.history_uploads persistence (object-storage references only). */
@Injectable()
export class HistoryUploadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    objectKey: string;
    originalFilename: string;
    mimeType: string;
    byteSize: number;
    uploadedByUserId: string;
  }) {
    return this.prisma.historyUpload.create({
      data: { ...input, status: 'pending' },
    });
  }

  async findById(id: string) {
    return this.prisma.historyUpload.findUnique({ where: { id } });
  }

  /** Pre-submit validation: fetch the candidate uploads in one read. */
  async findManyByIds(ids: string[]) {
    return this.prisma.historyUpload.findMany({ where: { id: { in: ids } } });
  }

  async list(
    filters: {
      status: string | null;
      appointmentRequestId: string | null;
      intakeSubmissionId: string | null;
    },
    limit: number,
    cursor?: string,
  ) {
    return this.prisma.historyUpload.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.appointmentRequestId
          ? { appointmentRequestId: filters.appointmentRequestId }
          : {}),
        ...(filters.intakeSubmissionId
          ? { intakeSubmissionId: filters.intakeSubmissionId }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async update(
    id: string,
    data: { status: string; rejectionReason?: string | null },
  ) {
    return this.prisma.historyUpload.update({ where: { id }, data });
  }
}
