import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { PublishingFacadePort, PagedResult } from './publishing-facade-port';
import { CreateArticleCommand } from '../commands/create-article.command';
import { CreateCategoryCommand } from '../commands/create-category.command';
import { CreateTagCommand } from '../commands/create-tag.command';
import { PublishArticleCommand } from '../commands/publish-article.command';
import { SubscribeNewsletterCommand } from '../commands/subscribe-newsletter.command';
import { UpdateArticleCommand } from '../commands/update-article.command';
import { UpdateCategoryCommand } from '../commands/update-category.command';
import { UpdateTagCommand } from '../commands/update-tag.command';
import {
  ArticleDetailDto,
  ArticleSummaryDto,
  CategoryDto,
  NewsletterSubscriptionDto,
  TagDto,
} from '../dto/publishing.responses.dto';
import { GetAdminArticleQuery } from '../queries/get-admin-article.query';
import { GetArticleQuery } from '../queries/get-article.query';
import { ListAdminArticlesQuery } from '../queries/list-admin-articles.query';
import { ListArticlesQuery } from '../queries/list-articles.query';
import { ListCategoriesQuery } from '../queries/list-categories.query';
import { ListTagsQuery } from '../queries/list-tags.query';

/**
 * Publishing facade (§3): thin delegation to the command/query buses.
 * Handlers own the behaviour; controllers see only this port.
 */
@Injectable()
export class PublishingFacade extends PublishingFacadePort {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {
    super();
  }

  createArticle(command: CreateArticleCommand): Promise<ArticleDetailDto> {
    return this.commands.execute(command);
  }

  updateArticle(command: UpdateArticleCommand): Promise<ArticleDetailDto> {
    return this.commands.execute(command);
  }

  publishArticle(command: PublishArticleCommand): Promise<ArticleDetailDto> {
    return this.commands.execute(command);
  }

  listArticles(
    query: ListArticlesQuery,
  ): Promise<PagedResult<ArticleSummaryDto>> {
    return this.queries.execute(query);
  }

  getArticle(query: GetArticleQuery): Promise<ArticleDetailDto> {
    return this.queries.execute(query);
  }

  listAdminArticles(
    query: ListAdminArticlesQuery,
  ): Promise<PagedResult<ArticleSummaryDto>> {
    return this.queries.execute(query);
  }

  getAdminArticle(query: GetAdminArticleQuery): Promise<ArticleDetailDto> {
    return this.queries.execute(query);
  }

  createCategory(command: CreateCategoryCommand): Promise<CategoryDto> {
    return this.commands.execute(command);
  }

  updateCategory(command: UpdateCategoryCommand): Promise<CategoryDto> {
    return this.commands.execute(command);
  }

  listCategories(query: ListCategoriesQuery): Promise<CategoryDto[]> {
    return this.queries.execute(query);
  }

  createTag(command: CreateTagCommand): Promise<TagDto> {
    return this.commands.execute(command);
  }

  updateTag(command: UpdateTagCommand): Promise<TagDto> {
    return this.commands.execute(command);
  }

  listTags(query: ListTagsQuery): Promise<TagDto[]> {
    return this.queries.execute(query);
  }

  subscribeNewsletter(
    command: SubscribeNewsletterCommand,
  ): Promise<NewsletterSubscriptionDto> {
    return this.commands.execute(command);
  }
}
