import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ClinicContentFacadePort } from '../../../clinic-content/application/facades/clinic-content-facade-port';
import {
  resolveAuthor,
  resolveCategory,
  resolveDefaultAuthor,
  resolveRelated,
  resolveTags,
  toSeoValues,
} from '../article-references';
import { CreateArticleCommand } from '../commands/create-article.command';
import { ArticlePresenter } from '../dto/article.presenter';
import { ArticleDetailDto } from '../dto/publishing.responses.dto';
import { badRequest } from '../errors';
import { slugify } from '../slug';
import { ArticleRepository } from '../../infrastructure/repositories/article.repository';
import { CategoryRepository } from '../../infrastructure/repositories/category.repository';
import { TagRepository } from '../../infrastructure/repositories/tag.repository';

@CommandHandler(CreateArticleCommand)
export class CreateArticleHandler implements ICommandHandler<CreateArticleCommand> {
  constructor(
    private readonly articles: ArticleRepository,
    private readonly categories: CategoryRepository,
    private readonly tags: TagRepository,
    private readonly clinicContent: ClinicContentFacadePort,
    private readonly presenter: ArticlePresenter,
  ) {}

  async execute(command: CreateArticleCommand): Promise<ArticleDetailDto> {
    const input = command.input;

    const categoryId = input.categoryId
      ? await resolveCategory(this.categories, input.categoryId)
      : null;
    const tagIds = await resolveTags(this.tags, input.tagIds ?? []);
    const relatedArticleIds = await resolveRelated(
      this.articles,
      input.relatedArticleIds ?? [],
    );
    const authorProfileId = input.authorProfileId
      ? await resolveAuthor(this.clinicContent, input.authorProfileId)
      : await resolveDefaultAuthor(this.clinicContent, command.userId);

    const slug = input.slug ?? slugify(input.title);
    if (await this.articles.slugExists(slug)) {
      throw badRequest('Slug already in use.');
    }

    const row = await this.articles.createArticle({
      slug,
      title: input.title,
      excerpt: input.excerpt ?? null,
      bodyMd: input.bodyMd,
      coverObjectKey: input.coverObjectKey ?? null,
      categoryId,
      authorProfileId,
      tagIds,
      relatedArticleIds,
      seo: input.seo ? toSeoValues(input.seo) : null,
    });

    return this.presenter.presentRow(row);
  }
}
