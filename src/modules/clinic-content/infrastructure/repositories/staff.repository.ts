import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface StaffProfileRow {
  id: string;
  displayName: string;
  title: string;
  credentials: string[];
  accreditations: string[];
  bioMd: string | null;
  photoObjectKey: string | null;
  specialisms: string[];
  published: boolean;
  sortOrder: number;
}

/**
 * Staff profile repository (content). Only published profiles are public.
 */
@Injectable()
export class StaffRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPublished(limit = 20, cursor?: string): Promise<StaffProfileRow[]> {
    return this.prisma.staffProfile.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }
}
