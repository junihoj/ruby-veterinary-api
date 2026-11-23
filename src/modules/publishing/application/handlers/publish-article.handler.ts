import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { PublishArticleCommand } from '../commands/publish-article.command';
import { ArticlePresenter } from '../dto/article.presenter';
import { ArticleDetailDto } from '../dto/publishing.responses.dto';
import { ArticlePublished } from '../events/article-published.event';
import { notFound } from '../errors';
import { ArticleRepository } from '../../infrastructure/repositories/article.repository';

@CommandHandler(PublishArticleCommand)
export class PublishArticleHandler implements ICommandHandler<PublishArticleCommand> {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly presenter: ArticlePresenter,
    private readonly events: IntegrationEventPublisher,
  ) {}

  async execute(command: PublishArticleCommand): Promise<ArticleDetailDto> {
    const id = PrefixedId.tryAnyToUuid(command.id);
    if (!id) throw notFound('Article not found.');
    const article = await this.articles.findAdminById(id);
    if (!article) throw notFound('Article not found.');

    // Idempotent: repeated publish is a successful no-op with no event.
    if (article.status === 'published') {
      return this.presenter.presentRow(article);
    }

    const row = await this.articles.updateArticle(id, {
      status: 'published',
      ...(article.publishedAt === null ? { publishedAt: new Date() } : {}),
    });

    this.events.publish(
      new ArticlePublished({
        articleId: PrefixedId.format('article', row.id),
        authorId: row.authorProfileId
          ? PrefixedId.format('staffProfile', row.authorProfileId)
          : null,
        categoryId: row.categoryId
          ? PrefixedId.format('category', row.categoryId)
          : null,
        categorySlug: row.category?.slug ?? null,
        slug: row.slug,
      }),
    );

    return this.presenter.presentRow(row);
  }
}
