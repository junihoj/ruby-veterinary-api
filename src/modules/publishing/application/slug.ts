/**
 * Kebab-case slug generation shared by articles, categories, and tags.
 * Explicit slugs are validated at the DTO boundary; generated slugs are
 * truncated to a sane length and fall back to a stable placeholder when the
 * text has no ASCII alphanumerics.
 */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'article';
}
