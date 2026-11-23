import { IntegrationEvent } from '../../../../shared/integration/integration-event';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { PublishArticleHandler } from './publish-article.handler';
import { PublishArticleCommand } from '../commands/publish-article.command';
import { SubscribeNewsletterHandler } from './subscribe-newsletter.handler';
import { SubscribeNewsletterCommand } from '../commands/subscribe-newsletter.command';
import { ArticlePresenter } from '../dto/article.presenter';
import { ArticleRepository } from '../../infrastructure/repositories/article.repository';
import { NewsletterRepository } from '../../infrastructure/repositories/newsletter.repository';
import { ArticlePublished } from '../events/article-published.event';
import { NewsletterSubscribed } from '../events/newsletter-subscribed.event';

const ARTICLE_UUID = '00000000-0000-4000-8000-000000000001';

function articleRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: ARTICLE_UUID,
    slug: 'senior-cats',
    status: 'published',
    publishedAt: new Date('2026-02-10T09:00:00.000Z'),
    authorProfileId: '00000000-0000-4000-8000-000000000002',
    categoryId: '00000000-0000-4000-8000-000000000003',
    category: { id: '00000000-0000-4000-8000-000000000003', slug: 'cat-care' },
    relationsFrom: [],
    ...overrides,
  };
}

function makeEvents(): {
  publish: jest.Mock<void, [IntegrationEvent<unknown>]>;
  publisher: IntegrationEventPublisher;
} {
  const publish = jest.fn<void, [IntegrationEvent<unknown>]>();
  const publishAll = jest.fn<void, [IntegrationEvent<unknown>[]]>();
  return {
    publish,
    publisher: { publish, publishAll },
  };
}

describe('publishing handlers', () => {
  describe('PublishArticleHandler', () => {
    const presentRow = jest.fn((row: unknown) => row);
    const presenter = { presentRow } as unknown as ArticlePresenter;

    beforeEach(() => jest.clearAllMocks());

    it('is a no-op for an already published article (no event, no update)', async () => {
      const findAdminById = jest.fn().mockResolvedValue(articleRow());
      const updateArticle = jest.fn();
      const articles = {
        findAdminById,
        updateArticle,
      } as unknown as ArticleRepository;
      const { publish, publisher } = makeEvents();
      const handler = new PublishArticleHandler(articles, presenter, publisher);

      const result = await handler.execute(
        new PublishArticleCommand('art_' + ARTICLE_UUID),
      );

      expect(result).toMatchObject({ status: 'published' });
      expect(updateArticle).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
    });

    it('sets publishedAt once and raises ArticlePublished', async () => {
      const findAdminById = jest
        .fn()
        .mockResolvedValue(articleRow({ status: 'draft', publishedAt: null }));
      const updateArticle = jest
        .fn<unknown, [string, Record<string, unknown>]>()
        .mockResolvedValue(
          articleRow({
            publishedAt: new Date('2026-04-01T12:00:00.000Z'),
          }),
        );
      const articles = {
        findAdminById,
        updateArticle,
      } as unknown as ArticleRepository;
      const { publish, publisher } = makeEvents();
      const handler = new PublishArticleHandler(articles, presenter, publisher);

      await handler.execute(new PublishArticleCommand('art_' + ARTICLE_UUID));

      expect(updateArticle).toHaveBeenCalledTimes(1);
      const update = updateArticle.mock.calls[0]?.[1] as {
        status?: string;
        publishedAt?: Date;
      };
      expect(update.status).toBe('published');
      expect(update.publishedAt).toBeInstanceOf(Date);
      expect(publish).toHaveBeenCalledTimes(1);
      const event = publish.mock.calls[0]?.[0];
      expect(event).toBeInstanceOf(ArticlePublished);
      expect((event as ArticlePublished).payload).toMatchObject({
        articleId: 'art_' + ARTICLE_UUID,
        slug: 'senior-cats',
        categorySlug: 'cat-care',
      });
    });

    it('404s a malformed or missing article id', async () => {
      const findAdminById = jest.fn().mockResolvedValue(null);
      const articles = { findAdminById } as unknown as ArticleRepository;
      const { publisher } = makeEvents();
      const handler = new PublishArticleHandler(articles, presenter, publisher);

      await expect(
        handler.execute(new PublishArticleCommand('not-a-prefixed-id')),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        handler.execute(new PublishArticleCommand('art_' + ARTICLE_UUID)),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('SubscribeNewsletterHandler', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns an existing active subscription without a second event', async () => {
      const findByEmail = jest.fn().mockResolvedValue({
        id: 'sub-1',
        email: 'a@example.com',
        status: 'active',
      });
      const create = jest.fn();
      const reactivate = jest.fn();
      const subscribers = {
        findByEmail,
        create,
        reactivate,
      } as unknown as NewsletterRepository;
      const { publish, publisher } = makeEvents();
      const handler = new SubscribeNewsletterHandler(subscribers, publisher);

      await expect(
        handler.execute(
          new SubscribeNewsletterCommand({ email: 'A@Example.com ' }),
        ),
      ).resolves.toEqual({ email: 'a@example.com', status: 'active' });
      expect(create).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
    });

    it('creates a pending row and raises NewsletterSubscribed', async () => {
      const findByEmail = jest.fn().mockResolvedValue(null);
      const create = jest.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000009',
        email: 'new@example.com',
        status: 'pending',
      });
      const subscribers = {
        findByEmail,
        create,
      } as unknown as NewsletterRepository;
      const { publish, publisher } = makeEvents();
      const handler = new SubscribeNewsletterHandler(subscribers, publisher);

      await expect(
        handler.execute(
          new SubscribeNewsletterCommand({
            email: 'new@example.com',
            source: 'footer',
          }),
        ),
      ).resolves.toEqual({ email: 'new@example.com', status: 'pending' });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          status: 'pending',
        }),
      );
      const event = publish.mock.calls[0]?.[0];
      expect(event).toBeInstanceOf(NewsletterSubscribed);
      expect((event as NewsletterSubscribed).payload).toEqual({
        subscriberId: 'nls_00000000-0000-4000-8000-000000000009',
        source: 'footer',
      });
    });

    it('reactivates an unsubscribed address back to pending', async () => {
      const findByEmail = jest.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000010',
        email: 'back@example.com',
        status: 'unsubscribed',
      });
      const create = jest.fn();
      const reactivate = jest.fn().mockResolvedValue({
        id: '00000000-0000-4000-8000-000000000010',
        email: 'back@example.com',
        status: 'pending',
      });
      const subscribers = {
        findByEmail,
        create,
        reactivate,
      } as unknown as NewsletterRepository;
      const { publish, publisher } = makeEvents();
      const handler = new SubscribeNewsletterHandler(subscribers, publisher);

      await expect(
        handler.execute(
          new SubscribeNewsletterCommand({ email: 'back@example.com' }),
        ),
      ).resolves.toEqual({ email: 'back@example.com', status: 'pending' });
      expect(reactivate).toHaveBeenCalledWith(
        '00000000-0000-4000-8000-000000000010',
        null,
      );
      expect(publish).toHaveBeenCalledTimes(1);
    });
  });
});
