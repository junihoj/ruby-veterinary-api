import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../src/generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface ServiceRow {
  id: string;
  name: string;
  slug: string;
  summary: string;
  descriptionMd: string | null;
  baselinePrice: Prisma.Decimal | null;
  currency: string | null;
  category: string;
  featured: boolean;
  requiresAppointment: boolean;
  published: boolean;
  sortOrder: number;
}

/**
 * Service repository (content). Only published services are public.
 */
@Injectable()
export class ServiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPublished(limit = 20, cursor?: string): Promise<ServiceRow[]> {
    return this.prisma.service.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async findBySlug(slug: string): Promise<ServiceRow | null> {
    return this.prisma.service.findFirst({
      where: { slug, published: true },
    });
  }
}
