import { Injectable } from '@nestjs/common';
import type { Client, Pet } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { DuplicateUserLinkError } from '../errors';
import { isUniqueViolation } from '../prisma-errors';

export interface ClientWriteFields {
  userId: string | null;
  displayName: string;
  email: string | null;
  phone: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  preferredContact: string;
  source: string;
}

export interface PetWriteFields {
  name: string;
  species: string;
  breed: string | null;
  sex: string | null;
  neutered: boolean | null;
  dateOfBirth: Date | null;
  weightKg: number | null;
  microchipId: string | null;
  notes: string | null;
}

/**
 * clients.clients persistence. Soft-deleted rows (status 'deleted') are
 * never returned by the read helpers. The one-active-client-per-user rule
 * (data-model/client-patient-records.md) is enforced by the uq_clients_user
 * unique index; violations surface as DuplicateUserLinkError → 409
 * ALREADY_LINKED.
 */
@Injectable()
export class ClientRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(fields: ClientWriteFields) {
    try {
      return await this.prisma.client.create({
        data: { ...fields, status: 'active' },
      });
    } catch (error) {
      if (isUniqueViolation(error, 'uq_clients_user')) {
        throw new DuplicateUserLinkError();
      }
      throw error;
    }
  }

  /**
   * Flow 2 filing (new-client branch): client + pets in one transaction so
   * acceptance never half-creates a client. Returns the full rows (the
   * caller maps them to summaries).
   */
  async createFromIntake(fields: ClientWriteFields, pets: PetWriteFields[]) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const client: Client = await tx.client.create({
          data: { ...fields, status: 'active' },
        });
        const created: Pet[] = [];
        for (const pet of pets) {
          created.push(
            await tx.pet.create({ data: { clientId: client.id, ...pet } }),
          );
        }
        return { client, pets: created };
      });
    } catch (error) {
      if (isUniqueViolation(error, 'uq_clients_user')) {
        throw new DuplicateUserLinkError();
      }
      throw error;
    }
  }

  /** Existing-client branch of Flow 2: file the pets under the client. */
  async attachPets(clientId: string, pets: PetWriteFields[]): Promise<Pet[]> {
    return this.prisma.$transaction(async (tx) => {
      const created: Pet[] = [];
      for (const pet of pets) {
        created.push(await tx.pet.create({ data: { clientId, ...pet } }));
      }
      return created;
    });
  }

  async findById(id: string) {
    return this.prisma.client.findFirst({
      where: { id, status: { not: 'deleted' } },
    });
  }

  async findActiveByUserId(userId: string) {
    return this.prisma.client.findFirst({
      where: { userId, status: 'active' },
      select: { id: true },
    });
  }

  async list(
    status: string | null,
    q: string | null,
    limit: number,
    cursor?: string,
  ) {
    const search = q?.trim();
    return this.prisma.client.findMany({
      where: {
        status: status ?? { not: 'deleted' },
        ...(search
          ? {
              OR: [
                {
                  displayName: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async update(
    id: string,
    data: Partial<ClientWriteFields> & { status?: string },
  ) {
    return this.prisma.client.update({ where: { id }, data });
  }
}
