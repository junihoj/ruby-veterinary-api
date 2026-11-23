import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ArticlePresenter } from '../dto/article.presenter';
import {
  ARTICLE_STATUSES,
  ArticleStatusInput,
} from '../dto/publishing.requests.dto';
import { ArticleSummaryDto } from '../dto/publishing.responses.dto';
import { badRequest } from '../errors';
import { ListAdminArticlesQuery } from '../queries/list-admin-articles.query';
import { ArticleRepository } from '../../infrastructure/repositories/article.repository';

@QueryHandler(ListAdminArticlesQuery)
export class ListAdminArticlesHandler implements IQueryHandler<ListAdminArticlesQuery> {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly presenter: ArticlePresenter,
  ) {}

  async execute(query: ListAdminArticlesQuery): Promise<{
    data: ArticleSummaryDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    if (
      query.filters.status &&
      !ARTICLE_STATUSES.includes(query.filters.status as ArticleStatusInput)
    ) {
      throw badRequest('Unknown article status.');
    }

    const rows = await this.articles.listAdmin(
      query.limit,
      parseCursor(query.cursor),
      query.filters,
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      data: await this.presenter.presentSummaries(page),
      nextCursor:
        hasMore && page.length > 0
          ? PrefixedId.format('article', page[page.length - 1].id)
          : null,
      hasMore,
    };
  }
}
