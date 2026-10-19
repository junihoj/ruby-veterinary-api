import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PetWriteFields } from './client.repository';

/**
 * clients.pets + medical_history_records + primary_veterinarian_links
 * persistence. Deleted pets are never returned by the read helpers.
 *
 * `setPrimaryVeterinarian` closes the previous current link and opens the
 * new one in a single transaction — preserving the one-current-per-pet
 * partial unique index the pharmacy guardrail (M5) depends on.
 */
@Injectable()
export class PetRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Pets of one client — deceased included (history matters), deleted not. */
  async listByClient(clientId: string) {
    return this.prisma.pet.findMany({
      where: { clientId, status: { not: 'deleted' } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Owner claim surface: pets whose client record points at this user. */
  async listByOwnerUserId(userId: string) {
    return this.prisma.pet.findMany({
      where: {
        status: { not: 'deleted' },
        client: { userId, status: { not: 'deleted' } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async findById(id: string) {
    return this.prisma.pet.findFirst({
      where: { id, status: { not: 'deleted' } },
    });
  }

  async create(clientId: string, fields: PetWriteFields) {
    return this.prisma.pet.create({ data: { clientId, ...fields } });
  }

  async update(
    id: string,
    data: Partial<PetWriteFields> & { status?: string },
  ) {
    return this.prisma.pet.update({ where: { id }, data });
  }

  async listHistory(petId: string) {
    return this.prisma.medicalHistoryRecord.findMany({
      where: { petId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async createHistory(
    petId: string,
    fields: {
      title: string;
      objectKey: string;
      mimeType: string;
      byteSize: number;
      source: string;
      uploadedByUserId: string;
      visitDate: Date | null;
      summary: string | null;
    },
  ) {
    return this.prisma.medicalHistoryRecord.create({
      data: { petId, ...fields },
    });
  }

  async listVeterinarianLinks(petId: string) {
    return this.prisma.primaryVeterinarianLink.findMany({
      where: { petId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Close the current link (effectiveTo null) and open the new one. */
  async setPrimaryVeterinarian(
    petId: string,
    veterinarianUserId: string,
    effectiveFrom: Date,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.primaryVeterinarianLink.updateMany({
        where: { petId, effectiveTo: null },
        data: { effectiveTo: effectiveFrom },
      });
      return tx.primaryVeterinarianLink.create({
        data: { petId, veterinarianUserId, effectiveFrom, effectiveTo: null },
      });
    });
  }
}
