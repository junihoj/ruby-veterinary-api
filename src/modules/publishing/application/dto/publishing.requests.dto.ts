import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * Publishing request bodies (publishing.yaml M7). The global ValidationPipe
 * whitelists strictly: unknown fields are 400 VALIDATION_FAILED.
 *
 * `@IsOptional` skips null as well as undefined. Update fields that cannot be
 * cleared use `@OptionalDefined` so an explicit null is a 400 instead of a
 * Prisma 500; nullable fields (category, excerpt, cover, description) keep
 * `@IsOptional` to support clearing.
 */
const OptionalDefined = () =>
  ValidateIf((_object, value) => value !== undefined);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const ARTICLE_STATUSES = ['draft', 'published', 'archived'] as const;
export type ArticleStatusInput = (typeof ARTICLE_STATUSES)[number];

export class ArticleSeoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  metaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  canonicalPath?: string;

  @IsOptional()
  @IsBoolean()
  noIndex?: boolean;
}

export class CreateArticleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @Matches(SLUG_RE, { message: 'slug must be lowercase kebab-case.' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  bodyMd: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverObjectKey?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tagIds?: string[];

  @IsOptional()
  @IsString()
  authorProfileId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  relatedArticleIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ArticleSeoDto)
  seo?: ArticleSeoDto;
}

export class UpdateArticleDto {
  @OptionalDefined()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @OptionalDefined()
  @IsString()
  @Matches(SLUG_RE, { message: 'slug must be lowercase kebab-case.' })
  slug?: string;

  /** `null` clears the excerpt. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string | null;

  @OptionalDefined()
  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  bodyMd?: string;

  /** `null` clears the cover object. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverObjectKey?: string | null;

  /** `null` clears the category; an id connects one. */
  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @OptionalDefined()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tagIds?: string[];

  @OptionalDefined()
  @IsString()
  authorProfileId?: string;

  @OptionalDefined()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  relatedArticleIds?: string[];

  @OptionalDefined()
  @IsIn(ARTICLE_STATUSES)
  status?: ArticleStatusInput;

  @OptionalDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ArticleSeoDto)
  seo?: ArticleSeoDto;
}

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(SLUG_RE, { message: 'slug must be lowercase kebab-case.' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateCategoryDto {
  @OptionalDefined()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @OptionalDefined()
  @IsString()
  @Matches(SLUG_RE, { message: 'slug must be lowercase kebab-case.' })
  slug?: string;

  /** `null` clears the description. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @OptionalDefined()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(SLUG_RE, { message: 'slug must be lowercase kebab-case.' })
  slug?: string;
}

export class UpdateTagDto {
  @OptionalDefined()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @OptionalDefined()
  @IsString()
  @Matches(SLUG_RE, { message: 'slug must be lowercase kebab-case.' })
  slug?: string;
}

export class SubscribeNewsletterDto {
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;
}
