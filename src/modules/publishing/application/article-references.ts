import { PrefixedId } from '../../../shared/kernel/domain/prefixed-id';
import { ClinicContentFacadePort } from '../../clinic-content/application/facades/clinic-content-facade-port';
import { badRequest } from './errors';
import { ArticleSeoDto } from './dto/publishing.requests.dto';
import type { SeoValues } from '../infrastructure/repositories/article.repository';
import { ArticleRepository } from '../infrastructure/repositories/article.repository';
import { CategoryRepository } from '../infrastructure/repositories/category.repository';
import { TagRepository } from '../infrastructure/repositories/tag.repository';

/**
 * Identifier parsing and reference validation shared by the article
 * commands. HTTP-level path ids are handled by their handlers (404); these
 * helpers handle body references (400).
 */
export function parseReference(raw: string, message: string): string {
  const id = PrefixedId.tryAnyToUuid(raw);
  if (!id) throw badRequest(message);
  return id;
}

export async function resolveCategory(
  categories: CategoryRepository,
  raw: string,
): Promise<string> {
  const id = parseReference(raw, 'Unknown category.');
  const row = await categories.findById(id);
  if (!row) throw badRequest('Unknown category.');
  return id;
}

export async function resolveTags(
  tags: TagRepository,
  rawIds: string[],
): Promise<string[]> {
  const ids = [
    ...new Set(rawIds.map((raw) => parseReference(raw, 'Unknown tag.'))),
  ];
  if (ids.length === 0) return [];
  const found = await tags.findByIds(ids);
  if (found.length !== ids.length) throw badRequest('Unknown tag.');
  return ids;
}

export async function resolveRelated(
  articles: ArticleRepository,
  rawIds: string[],
  selfId?: string,
): Promise<string[]> {
  const ids = rawIds.map((raw) =>
    parseReference(raw, 'Unknown related article.'),
  );
  if (new Set(ids).size !== ids.length) {
    throw badRequest('Duplicate related articles.');
  }
  if (selfId && ids.includes(selfId)) {
    throw badRequest('An article cannot relate to itself.');
  }
  if (ids.length === 0) return [];
  const found = await articles.findByIds(ids);
  if (found.length !== ids.length) {
    throw badRequest('Unknown related article.');
  }
  return ids;
}

export async function resolveAuthor(
  clinicContent: ClinicContentFacadePort,
  raw: string,
): Promise<string> {
  const id = parseReference(raw, 'Unknown author.');
  const profile = await clinicContent.getStaffProfileById(id);
  if (!profile) throw badRequest('Unknown or unpublished author.');
  return id;
}

export async function resolveDefaultAuthor(
  clinicContent: ClinicContentFacadePort,
  userId: string,
): Promise<string | null> {
  const profile = await clinicContent.getStaffProfileByUserId(userId);
  if (!profile) return null;
  return PrefixedId.tryAnyToUuid(profile.id);
}

export function toSeoValues(input: ArticleSeoDto): SeoValues {
  return {
    metaTitle: input.metaTitle ?? null,
    metaDescription: input.metaDescription ?? null,
    canonicalPath: input.canonicalPath ?? null,
    noIndex: input.noIndex ?? false,
  };
}

export function mergeSeoValues(
  existing: {
    metaTitle: string | null;
    metaDescription: string | null;
    canonicalPath: string | null;
    noIndex: boolean;
  },
  input: ArticleSeoDto,
): SeoValues {
  return {
    metaTitle:
      input.metaTitle !== undefined ? input.metaTitle : existing.metaTitle,
    metaDescription:
      input.metaDescription !== undefined
        ? input.metaDescription
        : existing.metaDescription,
    canonicalPath:
      input.canonicalPath !== undefined
        ? input.canonicalPath
        : existing.canonicalPath,
    noIndex: input.noIndex !== undefined ? input.noIndex : existing.noIndex,
  };
}
