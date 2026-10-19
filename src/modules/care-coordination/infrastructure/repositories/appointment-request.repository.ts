import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * intake.appointment_requests persistence. Cursor lists follow the shared
 * pattern (newest first, take limit+1 to detect hasMore).
 */
@Injectable()
export class AppointmentRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    userId: string | null;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    petName: string;
    petSpecies: string | null;
    reason: string;
    preferredWindowStart: Date | null;
    preferredWindowEnd: Date | null;
    urgency: string;
  }) {
    return this.prisma.appointmentRequest.create({
      data: {
        userId: input.userId,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        contactEmail: input.contactEmail,
        petName: input.petName,
        petSpecies: input.petSpecies,
        reason: input.reason,
        preferredWindowStart: input.preferredWindowStart,
        preferredWindowEnd: input.preferredWindowEnd,
        urgency: input.urgency,
        status: 'received',
      },
    });
  }

  async findById(id: string) {
    return this.prisma.appointmentRequest.findUnique({ where: { id } });
  }

  async list(status: string | null, limit: number, cursor?: string) {
    return this.prisma.appointmentRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.appointmentRequest.update({
      where: { id },
      data: { status },
    });
  }
}
