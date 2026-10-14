import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface DocumentRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  objectKey: string;
  mimeType: string;
  byteSize: number;
  published: boolean;
}

/**
 * Downloadable document repository (content). Only published documents
 * are public; bytes are never served through the API (ADR-0016).
 */
@Injectable()
export class DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPublished(limit = 20, cursor?: string): Promise<DocumentRow[]> {
    return this.prisma.downloadableDocument.findMany({
      where: { published: true },
      orderBy: { id: 'asc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async findById(id: string): Promise<DocumentRow | null> {
    return this.prisma.downloadableDocument.findFirst({
      where: { id, published: true },
    });
  }
}
