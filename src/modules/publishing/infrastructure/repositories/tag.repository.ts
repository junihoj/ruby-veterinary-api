import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

/** publishing.tags persistence. */
@Injectable()
export class TagRepository {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.tag.findMany({ orderBy: { name: 'asc' } });
  }

  findById(id: string) {
    return this.prisma.tag.findUnique({ where: { id } });
  }

  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.prisma.tag.findMany({ where: { id: { in: ids } } });
  }

  async slugExists(slug: string, exceptId?: string): Promise<boolean> {
    const row = await this.prisma.tag.findFirst({
      where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  }

  create(data: { name: string; slug: string }) {
    return this.prisma.tag.create({ data });
  }

  update(id: string, data: Prisma.TagUpdateInput) {
    return this.prisma.tag.update({ where: { id }, data });
  }
}
