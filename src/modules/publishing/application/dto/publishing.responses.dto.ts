/**
 * Publishing API response shapes (publishing.yaml M7). Ids are prefixed
 * (`art_`, `cat_`, `tag_`, `stf_`), URLs are short-lived presigned links, and
 * timestamps are ISO-8601 strings.
 */

export interface ArticleCategoryRefDto {
  id: string;
  name: string;
  slug: string;
}

export interface ArticleTagRefDto {
  id: string;
  name: string;
  slug: string;
}

export interface ArticleAuthorDto {
  id: string;
  displayName: string;
  title: string;
}

export interface ArticleSeoDto {
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalPath: string | null;
  noIndex: boolean;
}

export interface ArticleSummaryDto {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverObjectKey: string | null;
  coverUrl: string | null;
  status: string;
  category: ArticleCategoryRefDto | null;
  tags: ArticleTagRefDto[];
  author: ArticleAuthorDto | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleDetailDto extends ArticleSummaryDto {
  bodyMd: string;
  seo: ArticleSeoDto | null;
  related: ArticleSummaryDto[];
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
}

export interface TagDto {
  id: string;
  name: string;
  slug: string;
}

export interface NewsletterSubscriptionDto {
  email: string;
  status: string;
}
