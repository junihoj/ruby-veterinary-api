import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '../../../../generated/prisma/client';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { ClinicContentFacadePort } from '../../../clinic-content/application/facades/clinic-content-facade-port';
import {
  mergeSeoValues,
  resolveAuthor,
  resolveCategory,
  resolveRelated,
  resolveTags,
  toSeoValues,
} from '../article-references';
import { UpdateArticleCommand } from '../commands/update-article.command';
import { ArticlePresenter } from '../dto/article.presenter';
import { ArticleDetailDto } from '../dto/publishing.responses.dto';
import { ArticlePublished } from '../events/article-published.event';
import { ArticleUnpublished } from '../events/article-unpublished.event';
import { badRequest, notFound } from '../errors';
import { ArticleRepository } from '../../infrastructure/repositories/article.repository';
import { CategoryRepository } from '../../infrastructure/repositories/category.repository';
import { TagRepository } from '../../infrastructure/repositories/tag.repository';

@CommandHandler(UpdateArticleCommand)
export class UpdateArticleHandler implements ICommandHandler<UpdateArticleCommand> {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly categories: CategoryRepository,
    private readonly tags: TagRepository,
    private readonly clinicContent: ClinicContentFacadePort,
    private readonly presenter: ArticlePresenter,
    private readonly events: IntegrationEventPublisher,
  ) {}

  async execute(command: UpdateArticleCommand): Promise<ArticleDetailDto> {
    const id = PrefixedId.tryAnyToUuid(command.id);
    if (!id) throw notFound('Article not found.');
    const article = await this.articles.findAdminById(id);
    if (!article) throw notFound('Article not found.');

    const input = command.input;
    const data: Prisma.ArticleUpdateInput = {};

    if (input.title !== undefined) data.title = input.title;
    if (input.slug !== undefined) {
      if (await this.articles.slugExists(input.slug, id)) {
        throw badRequest('Slug already in use.');
      }
      data.slug = input.slug;
    }
    if (input.excerpt !== undefined) data.excerpt = input.excerpt;
    if (input.bodyMd !== undefined) data.bodyMd = input.bodyMd;
    if (input.coverObjectKey !== undefined) {
      data.coverObjectKey = input.coverObjectKey;
    }
    if (input.categoryId !== undefined) {
      data.category =
        input.categoryId === null
          ? { disconnect: true }
          : {
              connect: {
                id: await resolveCategory(this.categories, input.categoryId),
              },
            };
    }
    if (input.tagIds !== undefined) {
      const tagIds = await resolveTags(this.tags, input.tagIds);
      data.tags = {
        deleteMany: {},
        ...(tagIds.length
          ? {
              create: tagIds.map((tagId) => ({
                tag: { connect: { id: tagId } },
              })),
            }
          : {}),
      };
    }
    if (input.relatedArticleIds !== undefined) {
      const related = await resolveRelated(
        this.articles,
        input.relatedArticleIds,
        id,
      );
      data.relationsFrom = {
        deleteMany: {},
        ...(related.length
          ? {
              create: related.map((relatedArticleId, weight) => ({
                weight,
                relatedArticle: { connect: { id: relatedArticleId } },
              })),
            }
          : {}),
      };
    }
    if (input.authorProfileId !== undefined) {
      data.authorProfileId = await resolveAuthor(
        this.clinicContent,
        input.authorProfileId,
      );
    }
    if (input.seo !== undefined) {
      data.seoMetadata = article.seoMetadata
        ? { update: mergeSeoValues(article.seoMetadata, input.seo) }
        : { create: toSeoValues(input.seo) };
    }

    let publish = false;
    let unpublish: 'draft' | 'archived' | null = null;
    if (input.status !== undefined) {
      if (input.status === 'published') {
        if (article.status !== 'published') {
          publish = true;
        }
        data.status = 'published';
        if (article.publishedAt === null) data.publishedAt = new Date();
      } else {
        if (article.status === 'published') unpublish = input.status;
        data.status = input.status;
      }
    }

    const row = await this.articles.updateArticle(id, data);

    if (publish) {
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
    } else if (unpublish) {
      this.events.publish(
        new ArticleUnpublished({
          articleId: PrefixedId.format('article', row.id),
          reason: unpublish,
        }),
      );
    }

    return this.presenter.presentRow(row);
  }
}
