import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ArticlePresenter } from '../dto/article.presenter';
import { ArticleSummaryDto } from '../dto/publishing.responses.dto';
import { ListArticlesQuery } from '../queries/list-articles.query';
import { ArticleRepository } from '../../infrastructure/repositories/article.repository';

@QueryHandler(ListArticlesQuery)
export class ListArticlesHandler implements IQueryHandler<ListArticlesQuery> {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly presenter: ArticlePresenter,
  ) {}

  async execute(query: ListArticlesQuery): Promise<{
    data: ArticleSummaryDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const rows = await this.articles.listPublished(
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
