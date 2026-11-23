import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { badRequest } from '../../application/errors';

const categorySelect = { select: { id: true, name: true, slug: true } };

const cardInclude = {
  category: categorySelect,
  tags: {
    include: {
      tag: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { tag: { name: 'asc' } },
  },
} satisfies Prisma.ArticleInclude;

const detailInclude = {
  ...cardInclude,
  seoMetadata: true,
  relationsFrom: {
    orderBy: { weight: 'asc' },
    include: {
      relatedArticle: { include: cardInclude },
    },
  },
} satisfies Prisma.ArticleInclude;

export type ArticleCardRow = Prisma.ArticleGetPayload<{
  include: typeof cardInclude;
}>;
export type ArticleDetailRow = Prisma.ArticleGetPayload<{
  include: typeof detailInclude;
}>;

export interface ArticleListFilters {
  category?: string;
  tag?: string;
  status?: string;
  q?: string;
}

export interface ArticleCreateData {
  slug: string;
  title: string;
  excerpt: string | null;
  bodyMd: string;
  coverObjectKey: string | null;
  categoryId: string | null;
  authorProfileId: string | null;
  tagIds: string[];
  relatedArticleIds: string[];
  seo: SeoValues | null;
}

export interface SeoValues {
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalPath: string | null;
  noIndex: boolean;
}

/**
 * Publishing article persistence. Public reads only ever see `published`
 * rows; staff reads use the same shape but include every status. List
 * cursors are bare UUIDs already parsed at the HTTP boundary.
 */
@Injectable()
export class ArticleRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCursor(cursor?: string): Promise<void> {
    if (!cursor) return;
    const row = await this.prisma.article.findUnique({
      where: { id: cursor },
      select: { id: true },
    });
    if (!row) throw badRequest('Invalid cursor.');
  }

  async listPublished(
    limit: number,
    cursor?: string,
    filters: ArticleListFilters = {},
  ): Promise<ArticleCardRow[]> {
    await this.assertCursor(cursor);
    return this.prisma.article.findMany({
      where: {
        status: 'published',
        ...(filters.category ? { category: { slug: filters.category } } : {}),
        ...(filters.tag
          ? { tags: { some: { tag: { slug: filters.tag } } } }
          : {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: cardInclude,
    });
  }

  async listAdmin(
    limit: number,
    cursor?: string,
    filters: ArticleListFilters = {},
  ): Promise<ArticleCardRow[]> {
    await this.assertCursor(cursor);
    return this.prisma.article.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.category ? { category: { slug: filters.category } } : {}),
        ...(filters.tag
          ? { tags: { some: { tag: { slug: filters.tag } } } }
          : {}),
        ...(filters.q
          ? {
              OR: [
                { title: { contains: filters.q, mode: 'insensitive' } },
                { slug: { contains: filters.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: cardInclude,
    });
  }

  async findPublishedBySlug(slug: string): Promise<ArticleDetailRow | null> {
    return this.prisma.article.findFirst({
      where: { slug, status: 'published' },
      include: detailInclude,
    });
  }

  async findAdminById(id: string): Promise<ArticleDetailRow | null> {
    return this.prisma.article.findUnique({
      where: { id },
      include: detailInclude,
    });
  }

  async findRelatedPublished(
    categoryId: string,
    excludeId: string,
    limit = 3,
  ): Promise<ArticleCardRow[]> {
    return this.prisma.article.findMany({
      where: {
        status: 'published',
        categoryId,
        id: { not: excludeId },
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: cardInclude,
    });
  }

  async findByIds(ids: string[]): Promise<Array<{ id: string }>> {
    if (ids.length === 0) return [];
    return this.prisma.article.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
  }

  async slugExists(slug: string, exceptId?: string): Promise<boolean> {
    const row = await this.prisma.article.findFirst({
      where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    return row !== null;
  }

  async createArticle(data: ArticleCreateData): Promise<ArticleDetailRow> {
    return this.prisma.article.create({
      data: {
        slug: data.slug,
        title: data.title,
        excerpt: data.excerpt,
        bodyMd: data.bodyMd,
        coverObjectKey: data.coverObjectKey,
        authorProfileId: data.authorProfileId,
        status: 'draft',
        ...(data.categoryId
          ? { category: { connect: { id: data.categoryId } } }
          : {}),
        ...(data.seo ? { seoMetadata: { create: data.seo } } : {}),
        ...(data.tagIds.length
          ? {
              tags: {
                create: data.tagIds.map((tagId) => ({
                  tag: { connect: { id: tagId } },
                })),
              },
            }
          : {}),
        ...(data.relatedArticleIds.length
          ? {
              relationsFrom: {
                create: data.relatedArticleIds.map(
                  (relatedArticleId, weight) => ({
                    weight,
                    relatedArticle: { connect: { id: relatedArticleId } },
                  }),
                ),
              },
            }
          : {}),
      },
      include: detailInclude,
    });
  }

  async updateArticle(
    id: string,
    data: Prisma.ArticleUpdateInput,
  ): Promise<ArticleDetailRow> {
    return this.prisma.article.update({
      where: { id },
      data,
      include: detailInclude,
    });
  }
}
