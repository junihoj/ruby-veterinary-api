import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ArticlePresenter } from '../dto/article.presenter';
import { ArticleDetailDto } from '../dto/publishing.responses.dto';
import { notFound } from '../errors';
import { GetAdminArticleQuery } from '../queries/get-admin-article.query';
import { ArticleRepository } from '../../infrastructure/repositories/article.repository';

@QueryHandler(GetAdminArticleQuery)
export class GetAdminArticleHandler implements IQueryHandler<GetAdminArticleQuery> {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly presenter: ArticlePresenter,
  ) {}

  async execute(query: GetAdminArticleQuery): Promise<ArticleDetailDto> {
    const id = PrefixedId.tryAnyToUuid(query.id);
    if (!id) throw notFound('Article not found.');
    const row = await this.articles.findAdminById(id);
    if (!row) throw notFound('Article not found.');
    return this.presenter.presentRow(row);
  }
}
