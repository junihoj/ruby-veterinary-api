import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ErrorEnvelope } from '../src/shared/cross-cutting/envelope';
import { PrefixedId } from '../src/shared/kernel/domain/prefixed-id';
import type { AuthTokensDto } from '../src/modules/identity/application/dto/auth-response.dto';
import type {
  ArticleDetailDto,
  ArticleSummaryDto,
  CategoryDto,
  NewsletterSubscriptionDto,
  TagDto,
} from '../src/modules/publishing/application/dto/publishing.responses.dto';
import {
  CATALOG_MANAGER_EMAIL,
  CATALOG_MANAGER_PASSWORD,
} from '../prisma/seed-credentials';

interface Envelope<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}
interface PagedEnvelope<T> {
  data: T[];
  meta: {
    requestId: string;
    timestamp: string;
    pagination: { limit: number; cursor: string | null; hasMore: boolean };
  };
}

/**
 * Publishing e2e (M7): public article/taxonomy reads and cache headers, staff
 * draft authoring + draft reads, publish/unpublish transitions, related-feed
 * fallback, taxonomy maintenance, and newsletter capture.
 *
 * Requires DATABASE_URL → ruby_veterinary_test, migrated and seeded. Rows
 * created here use a run id and are residue-tolerant.
 */
jest.setTimeout(120_000);

describe('Publishing content path (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000)}`;
  const clientEmail = `reader-${runId}@example.com`;
  const clientPassword = 'reader-password-123';

  let staffToken = '';
  let clientToken = '';
  let catCareId = '';
  let dogCareId = '';
  let nutritionTagId = '';
  let dentalTagId = '';
  let adaProfileId = '';
  let dentalArticleId = '';
  let dentalArticleSlug = '';

  let articleId = '';
  let articleSlug = '';
  let secondArticleId = '';
  let secondArticleSlug = '';
  let firstPublishedAt = '';

  const server = () => request(app.getHttpServer());
  const auth = (token?: string) =>
    token ? { Authorization: `Bearer ${token}` } : {};
  const get = (path: string, token?: string) =>
    server().get(`/api/v1${path}`).set(auth(token));
  const post = (path: string, token?: string) =>
    server().post(`/api/v1${path}`).set(auth(token));
  const patch = (path: string, token?: string) =>
    server().patch(`/api/v1${path}`).set(auth(token));

  beforeAll(async () => {
    app = (await createApp()) as INestApplication<App>;
    prisma = app.get(PrismaService);

    const [catCare, dogCare, nutrition, dental, dentalArticle] =
      await Promise.all([
        prisma.category.findUnique({ where: { slug: 'cat-care' } }),
        prisma.category.findUnique({ where: { slug: 'dog-care' } }),
        prisma.tag.findUnique({ where: { slug: 'nutrition' } }),
        prisma.tag.findUnique({ where: { slug: 'dental-care' } }),
        prisma.article.findUnique({ where: { slug: 'dental-care-basics' } }),
      ]);
    if (!catCare || !dogCare || !nutrition || !dental || !dentalArticle) {
      throw new Error(
        'Publishing seed fixtures missing — run `pnpm db:seed` against the test DB first.',
      );
    }
    catCareId = PrefixedId.format('category', catCare.id);
    dogCareId = PrefixedId.format('category', dogCare.id);
    nutritionTagId = PrefixedId.format('tag', nutrition.id);
    dentalTagId = PrefixedId.format('tag', dental.id);
    dentalArticleId = PrefixedId.format('article', dentalArticle.id);
    dentalArticleSlug = dentalArticle.slug;

    const adaUser = await prisma.user.findUnique({
      where: { email: 'ada@ruby-veterinary.example.com' },
    });
    const adaProfile = adaUser
      ? await prisma.staffProfile.findUnique({
          where: { userId: adaUser.id },
        })
      : null;
    if (!adaProfile) {
      throw new Error('Ada staff profile missing from seed.');
    }
    adaProfileId = PrefixedId.format('staffProfile', adaProfile.id);

    const staffLogin = await post('/auth/login')
      .send({
        email: CATALOG_MANAGER_EMAIL,
        password: CATALOG_MANAGER_PASSWORD,
      })
      .expect(200);
    staffToken = (staffLogin.body as Envelope<AuthTokensDto>).data.tokens
      .accessToken;

    await post('/auth/register')
      .send({ email: clientEmail, password: clientPassword })
      .expect(201);
    const clientLogin = await post('/auth/login')
      .send({ email: clientEmail, password: clientPassword })
      .expect(200);
    clientToken = (clientLogin.body as Envelope<AuthTokensDto>).data.tokens
      .accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('public reads', () => {
    it('GET /articles → 200 + cache header + published seed content', async () => {
      const res = await get('/articles?limit=100').expect(200);
      expect(res.headers['cache-control']).toBe('public, max-age=60');
      const body = res.body as PagedEnvelope<ArticleSummaryDto>;
      expect(body.data.some((a) => a.slug === dentalArticleSlug)).toBe(true);
      expect(body.data.every((a) => a.status === 'published')).toBe(true);
      expect(body.meta.pagination.limit).toBe(100);
    });

    it('filters by category and tag', async () => {
      const byCategory = await get('/articles?category=cat-care').expect(200);
      const catPage = byCategory.body as PagedEnvelope<ArticleSummaryDto>;
      expect(catPage.data.length).toBeGreaterThan(0);
      expect(catPage.data.every((a) => a.category?.slug === 'cat-care')).toBe(
        true,
      );

      const byTag = await get('/articles?tag=dental-care').expect(200);
      const tagPage = byTag.body as PagedEnvelope<ArticleSummaryDto>;
      expect(tagPage.data.some((a) => a.slug === dentalArticleSlug)).toBe(true);
    });

    it('paginates with a prefixed article cursor', async () => {
      const first = await get('/articles?limit=1').expect(200);
      const firstPage = first.body as PagedEnvelope<ArticleSummaryDto>;
      expect(firstPage.data).toHaveLength(1);
      expect(firstPage.meta.pagination.hasMore).toBe(true);
      expect(firstPage.meta.pagination.cursor).toMatch(/^art_/);

      const second = await get(
        `/articles?limit=1&cursor=${encodeURIComponent(
          firstPage.meta.pagination.cursor as string,
        )}`,
      ).expect(200);
      const secondPage = second.body as PagedEnvelope<ArticleSummaryDto>;
      expect(secondPage.data[0]?.id).not.toBe(firstPage.data[0]?.id);
    });

    it('GET /articles/{slug} includes author, tags, SEO, and related feed', async () => {
      const res = await get(`/articles/${dentalArticleSlug}`).expect(200);
      expect(res.headers['cache-control']).toBe('public, max-age=60');
      const article = (res.body as Envelope<ArticleDetailDto>).data;
      expect(article.slug).toBe(dentalArticleSlug);
      expect(article.bodyMd.length).toBeGreaterThan(0);
      expect(article.author?.displayName).toBe('James Turing');
      expect(article.tags.some((tag) => tag.slug === 'dental-care')).toBe(true);
      expect(article.seo?.canonicalPath).toBe('/blog/dental-care-basics');
      expect(
        article.related.some((r) => r.slug === 'feeding-senior-cats'),
      ).toBe(true);
    });

    it('GET /categories and GET /tags are public and cached', async () => {
      const categories = await get('/categories').expect(200);
      expect(categories.headers['cache-control']).toBe('public, max-age=60');
      expect(
        (categories.body as Envelope<CategoryDto[]>).data.some(
          (c) => c.slug === 'cat-care',
        ),
      ).toBe(true);

      const tags = await get('/tags').expect(200);
      expect(tags.headers['cache-control']).toBe('public, max-age=60');
      expect(
        (tags.body as Envelope<TagDto[]>).data.some(
          (t) => t.slug === 'nutrition',
        ),
      ).toBe(true);
    });
  });

  describe('staff authoring and draft reads', () => {
    it('creates a draft with explicit author, tags, SEO, and relations', async () => {
      const title = `M7 Cat Nutrition ${runId}`;
      const res = await post('/articles', staffToken)
        .send({
          title,
          excerpt: 'A test draft with an explicit byline.',
          bodyMd: 'Draft body for the M7 publishing e2e suite.',
          categoryId: catCareId,
          tagIds: [nutritionTagId],
          authorProfileId: adaProfileId,
          relatedArticleIds: [dentalArticleId],
          seo: {
            metaTitle: `M7 SEO ${runId}`,
            metaDescription: 'SEO description for the M7 test article.',
            canonicalPath: `/blog/m7-${runId}`,
          },
        })
        .expect(201);

      const article = (res.body as Envelope<ArticleDetailDto>).data;
      articleId = article.id;
      articleSlug = article.slug;
      expect(article.id).toMatch(/^art_/);
      expect(article.status).toBe('draft');
      expect(article.publishedAt).toBeNull();
      expect(article.author?.id).toBe(adaProfileId);
      expect(article.tags.map((t) => t.id)).toEqual([nutritionTagId]);
      expect(article.seo?.metaTitle).toBe(`M7 SEO ${runId}`);
      expect(article.related.map((r) => r.id)).toContain(dentalArticleId);
    });

    it('defaults the author to the acting user profile or null', async () => {
      const res = await post('/articles', staffToken)
        .send({
          title: `M7 Default Author ${runId}`,
          bodyMd: 'Grace has no published staff profile in the seed.',
          categoryId: dogCareId,
        })
        .expect(201);
      const article = (res.body as Envelope<ArticleDetailDto>).data;
      secondArticleId = article.id;
      secondArticleSlug = article.slug;
      expect(article.author).toBeNull();
    });

    it('blocks clients from creating articles', async () => {
      const res = await post('/articles', clientToken)
        .send({ title: 'Nope', bodyMd: 'Nope' })
        .expect(403);
      expect((res.body as ErrorEnvelope).error.code).toBe('STAFF_ONLY');
    });

    it('rejects unknown references and duplicate slugs', async () => {
      const base = { title: 'Reference check', bodyMd: 'Body' };
      const unknownCategory = await post('/articles', staffToken)
        .send({
          ...base,
          categoryId: 'cat_00000000-0000-0000-0000-000000000000',
        })
        .expect(400);
      expect((unknownCategory.body as ErrorEnvelope).error.code).toBe(
        'VALIDATION_FAILED',
      );

      await post('/articles', staffToken)
        .send({ ...base, tagIds: ['tag_00000000-0000-0000-0000-000000000000'] })
        .expect(400);
      await post('/articles', staffToken)
        .send({
          ...base,
          authorProfileId: 'stf_00000000-0000-0000-0000-000000000000',
        })
        .expect(400);
      await post('/articles', staffToken)
        .send({
          ...base,
          relatedArticleIds: ['art_00000000-0000-0000-0000-000000000000'],
        })
        .expect(400);
      await post('/articles', staffToken)
        .send({ ...base, slug: articleSlug })
        .expect(400);
    });

    it('admin list and detail see drafts', async () => {
      const list = await get(
        `/admin/articles?status=draft&q=${encodeURIComponent(runId)}`,
        staffToken,
      ).expect(200);
      expect(list.headers['cache-control']).toBe('no-store');
      const page = list.body as PagedEnvelope<ArticleSummaryDto>;
      expect(page.data.some((a) => a.id === articleId)).toBe(true);
      expect(page.data.every((a) => a.status === 'draft')).toBe(true);

      const detail = await get(
        `/admin/articles/${articleId}`,
        staffToken,
      ).expect(200);
      expect(detail.headers['cache-control']).toBe('no-store');
      expect((detail.body as Envelope<ArticleDetailDto>).data.slug).toBe(
        articleSlug,
      );

      await get('/admin/articles?status=bogus', staffToken).expect(400);
    });

    it('public reads hide drafts', async () => {
      await get(`/articles/${articleSlug}`).expect(404);
    });

    it('rejects null for non-nullable update fields', async () => {
      await patch(`/articles/${articleId}`, staffToken)
        .send({ title: null })
        .expect(400);
      await patch(`/articles/${articleId}`, staffToken)
        .send({ status: null })
        .expect(400);
      await patch(`/articles/${articleId}`, staffToken)
        .send({ tagIds: null })
        .expect(400);
    });
  });

  describe('publish and update transitions', () => {
    it('publishes, sets publishedAt, and exposes the article publicly', async () => {
      const res = await post(
        `/articles/${articleId}/publish`,
        staffToken,
      ).expect(200);
      const article = (res.body as Envelope<ArticleDetailDto>).data;
      expect(article.status).toBe('published');
      expect(article.publishedAt).not.toBeNull();
      firstPublishedAt = article.publishedAt as string;

      const publicDetail = await get(`/articles/${articleSlug}`).expect(200);
      const publicArticle = (publicDetail.body as Envelope<ArticleDetailDto>)
        .data;
      expect(publicArticle.bodyMd).toContain('M7 publishing e2e');
      expect(publicArticle.related.map((r) => r.id)).toContain(dentalArticleId);
    });

    it('publish is idempotent and never moves publishedAt', async () => {
      const res = await post(
        `/articles/${articleId}/publish`,
        staffToken,
      ).expect(200);
      expect((res.body as Envelope<ArticleDetailDto>).data.publishedAt).toBe(
        firstPublishedAt,
      );
    });

    it('updates fields, replaces tags and relations, and falls back to category', async () => {
      const res = await patch(`/articles/${articleId}`, staffToken)
        .send({
          title: `M7 Cat Nutrition Updated ${runId}`,
          categoryId: dogCareId,
          tagIds: [dentalTagId],
          relatedArticleIds: [],
          seo: { noIndex: true },
        })
        .expect(200);
      const article = (res.body as Envelope<ArticleDetailDto>).data;
      expect(article.title).toContain('Updated');
      expect(article.category?.id).toBe(dogCareId);
      expect(article.tags.map((t) => t.id)).toEqual([dentalTagId]);
      expect(article.related).toEqual([]);
      expect(article.seo?.noIndex).toBe(true);

      // Explicit relations are now empty, so the public detail falls back to
      // the latest published article in the new category.
      const publicDetail = await get(`/articles/${articleSlug}`).expect(200);
      const publicArticle = (publicDetail.body as Envelope<ArticleDetailDto>)
        .data;
      expect(publicArticle.related.length).toBeGreaterThan(0);
      expect(
        publicArticle.related.every((r) => r.category?.slug === 'dog-care'),
      ).toBe(true);
    });

    it('PATCH status published works and archived hides the article', async () => {
      const publish = await patch(`/articles/${secondArticleId}`, staffToken)
        .send({ status: 'published' })
        .expect(200);
      const published = (publish.body as Envelope<ArticleDetailDto>).data;
      expect(published.status).toBe('published');
      expect(published.publishedAt).not.toBeNull();

      await get(`/articles/${secondArticleSlug}`).expect(200);

      const archive = await patch(`/articles/${secondArticleId}`, staffToken)
        .send({ status: 'archived' })
        .expect(200);
      expect((archive.body as Envelope<ArticleDetailDto>).data.status).toBe(
        'archived',
      );
      await get(`/articles/${secondArticleSlug}`).expect(404);
      await get(`/admin/articles/${secondArticleId}`, staffToken).expect(200);
    });

    it('re-publishing an archived article retains the first publishedAt', async () => {
      await patch(`/articles/${secondArticleId}`, staffToken)
        .send({ status: 'published' })
        .expect(200);
      const archived = await patch(`/articles/${secondArticleId}`, staffToken)
        .send({ status: 'archived' })
        .expect(200);
      const previous = (archived.body as Envelope<ArticleDetailDto>).data
        .publishedAt;

      const republished = await post(
        `/articles/${secondArticleId}/publish`,
        staffToken,
      ).expect(200);
      expect(
        (republished.body as Envelope<ArticleDetailDto>).data.publishedAt,
      ).toBe(previous);
    });
  });

  describe('taxonomy maintenance', () => {
    it('creates and patches a category; duplicate slug is 400', async () => {
      const slug = `m7-category-${runId}`;
      const created = await post('/categories', staffToken)
        .send({ name: `M7 Category ${runId}`, slug, description: 'Test' })
        .expect(201);
      const category = (created.body as Envelope<CategoryDto>).data;
      expect(category.id).toMatch(/^cat_/);

      const patched = await patch(`/categories/${category.id}`, staffToken)
        .send({ name: `M7 Category Renamed ${runId}`, sortOrder: 7 })
        .expect(200);
      const updated = (patched.body as Envelope<CategoryDto>).data;
      expect(updated.name).toContain('Renamed');
      expect(updated.sortOrder).toBe(7);

      await post('/categories', staffToken)
        .send({ name: 'Duplicate', slug })
        .expect(400);
    });

    it('creates and patches a tag; duplicate slug is 400', async () => {
      const slug = `m7-tag-${runId}`;
      const created = await post('/tags', staffToken)
        .send({ name: `M7 Tag ${runId}`, slug })
        .expect(201);
      const tag = (created.body as Envelope<TagDto>).data;
      expect(tag.id).toMatch(/^tag_/);

      const patched = await patch(`/tags/${tag.id}`, staffToken)
        .send({ name: `M7 Tag Renamed ${runId}` })
        .expect(200);
      expect((patched.body as Envelope<TagDto>).data.name).toContain('Renamed');

      await post('/tags', staffToken)
        .send({ name: 'Duplicate', slug })
        .expect(400);
    });
  });

  describe('newsletter', () => {
    it('stores pending, reactivates unsubscribed, is idempotent, and rate limits', async () => {
      const email = `newsletter-${runId}@example.com`;
      const first = await post('/newsletter/subscribe')
        .send({ email, source: 'footer' })
        .expect(201);
      expect(first.headers['cache-control']).toBe('no-store');
      expect((first.body as Envelope<NewsletterSubscriptionDto>).data).toEqual({
        email,
        status: 'pending',
      });

      await prisma.newsletterSubscriber.update({
        where: { email },
        data: { status: 'unsubscribed', confirmedAt: new Date() },
      });
      const reactivated = await post('/newsletter/subscribe')
        .send({ email })
        .expect(201);
      expect(
        (reactivated.body as Envelope<NewsletterSubscriptionDto>).data.status,
      ).toBe('pending');

      await post('/newsletter/subscribe').send({ email }).expect(201);
      await post('/newsletter/subscribe')
        .send({ email: `newsletter-a-${runId}@example.com` })
        .expect(201);
      await post('/newsletter/subscribe')
        .send({ email: `newsletter-b-${runId}@example.com` })
        .expect(201);

      const limited = await post('/newsletter/subscribe')
        .send({ email: `newsletter-c-${runId}@example.com` })
        .expect(429);
      expect((limited.body as ErrorEnvelope).error.code).toBe('RATE_LIMITED');
    });
  });
});
