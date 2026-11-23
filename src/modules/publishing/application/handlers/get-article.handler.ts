import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ArticlePresenter } from '../dto/article.presenter';
import { ArticleDetailDto } from '../dto/publishing.responses.dto';
import { notFound } from '../errors';
import { GetArticleQuery } from '../queries/get-article.query';
import {
  ArticleCardRow,
  ArticleRepository,
} from '../../infrastructure/repositories/article.repository';

@QueryHandler(GetArticleQuery)
export class GetArticleHandler implements IQueryHandler<GetArticleQuery> {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly presenter: ArticlePresenter,
  ) {}

  async execute(query: GetArticleQuery): Promise<ArticleDetailDto> {
    const row = await this.articles.findPublishedBySlug(query.slug);
    if (!row) throw notFound('Article not found.');

    const explicit = row.relationsFrom
      .map((link) => link.relatedArticle)
      .filter((related) => related.status === 'published');

    let related: ArticleCardRow[] = explicit;
    if (related.length === 0 && row.categoryId) {
      related = await this.articles.findRelatedPublished(
        row.categoryId,
        row.id,
      );
    }

    return this.presenter.presentDetail(row, related);
  }
}
