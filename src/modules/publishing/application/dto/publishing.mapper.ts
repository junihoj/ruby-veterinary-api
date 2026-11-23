import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import type { StaffProfileDto } from '../../../clinic-content/application/dto/clinic-content.dto';
import type {
  ArticleCardRow,
  ArticleDetailRow,
} from '../../infrastructure/repositories/article.repository';
import {
  ArticleAuthorDto,
  ArticleDetailDto,
  ArticleSeoDto,
  ArticleSummaryDto,
  CategoryDto,
  TagDto,
} from './publishing.responses.dto';

export function toArticleAuthor(
  profile: StaffProfileDto | null | undefined,
): ArticleAuthorDto | null {
  if (!profile) return null;
  return {
    id: profile.id,
    displayName: profile.displayName,
    title: profile.title,
  };
}

function toSeo(row: ArticleDetailRow['seoMetadata']): ArticleSeoDto | null {
  if (!row) return null;
  return {
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    canonicalPath: row.canonicalPath,
    noIndex: row.noIndex,
  };
}

export function toArticleSummary(
  row: ArticleCardRow,
  author: ArticleAuthorDto | null,
  coverUrl: string | null,
): ArticleSummaryDto {
  return {
    id: PrefixedId.format('article', row.id),
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverObjectKey: row.coverObjectKey,
    coverUrl,
    status: row.status,
    category: row.category
      ? {
          id: PrefixedId.format('category', row.category.id),
          name: row.category.name,
          slug: row.category.slug,
        }
      : null,
    tags: row.tags.map((link) => ({
      id: PrefixedId.format('tag', link.tag.id),
      name: link.tag.name,
      slug: link.tag.slug,
    })),
    author,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toArticleDetail(
  row: ArticleDetailRow,
  author: ArticleAuthorDto | null,
  coverUrl: string | null,
  related: ArticleSummaryDto[],
): ArticleDetailDto {
  return {
    ...toArticleSummary(row, author, coverUrl),
    bodyMd: row.bodyMd,
    seo: toSeo(row.seoMetadata),
    related,
  };
}

export function toCategoryDto(row: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
}): CategoryDto {
  return {
    id: PrefixedId.format('category', row.id),
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sortOrder,
  };
}

export function toTagDto(row: {
  id: string;
  name: string;
  slug: string;
}): TagDto {
  return {
    id: PrefixedId.format('tag', row.id),
    name: row.name,
    slug: row.slug,
  };
}
