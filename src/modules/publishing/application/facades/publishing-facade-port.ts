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

export interface PagedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Public API of the Publishing context (§6.1). Controllers depend only on
 * this port, bound to the concrete facade with `useExisting` (§3).
 */
export abstract class PublishingFacadePort {
  abstract createArticle(
    command: CreateArticleCommand,
  ): Promise<ArticleDetailDto>;
  abstract updateArticle(
    command: UpdateArticleCommand,
  ): Promise<ArticleDetailDto>;
  abstract publishArticle(
    command: PublishArticleCommand,
  ): Promise<ArticleDetailDto>;
  abstract listArticles(
    query: ListArticlesQuery,
  ): Promise<PagedResult<ArticleSummaryDto>>;
  abstract getArticle(query: GetArticleQuery): Promise<ArticleDetailDto>;
  abstract listAdminArticles(
    query: ListAdminArticlesQuery,
  ): Promise<PagedResult<ArticleSummaryDto>>;
  abstract getAdminArticle(
    query: GetAdminArticleQuery,
  ): Promise<ArticleDetailDto>;

  abstract createCategory(command: CreateCategoryCommand): Promise<CategoryDto>;
  abstract updateCategory(command: UpdateCategoryCommand): Promise<CategoryDto>;
  abstract listCategories(query: ListCategoriesQuery): Promise<CategoryDto[]>;

  abstract createTag(command: CreateTagCommand): Promise<TagDto>;
  abstract updateTag(command: UpdateTagCommand): Promise<TagDto>;
  abstract listTags(query: ListTagsQuery): Promise<TagDto[]>;

  abstract subscribeNewsletter(
    command: SubscribeNewsletterCommand,
  ): Promise<NewsletterSubscriptionDto>;
}
