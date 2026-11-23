import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { StorageModule } from '../../shared/storage/storage.module';
import { IntegrationEventPublisher } from '../../shared/integration/integration-event-publisher';
import { InProcessEventPublisher } from '../../shared/integration/in-process-event-publisher';
import { ClinicContentModule } from '../clinic-content/clinic-content.module';
import { ArticlePresenter } from './application/dto/article.presenter';
import { CreateArticleHandler } from './application/handlers/create-article.handler';
import { CreateCategoryHandler } from './application/handlers/create-category.handler';
import { CreateTagHandler } from './application/handlers/create-tag.handler';
import { GetAdminArticleHandler } from './application/handlers/get-admin-article.handler';
import { GetArticleHandler } from './application/handlers/get-article.handler';
import { ListAdminArticlesHandler } from './application/handlers/list-admin-articles.handler';
import { ListArticlesHandler } from './application/handlers/list-articles.handler';
import { ListCategoriesHandler } from './application/handlers/list-categories.handler';
import { ListTagsHandler } from './application/handlers/list-tags.handler';
import { PublishArticleHandler } from './application/handlers/publish-article.handler';
import { SubscribeNewsletterHandler } from './application/handlers/subscribe-newsletter.handler';
import { UpdateArticleHandler } from './application/handlers/update-article.handler';
import { UpdateCategoryHandler } from './application/handlers/update-category.handler';
import { UpdateTagHandler } from './application/handlers/update-tag.handler';
import { PublishingFacade } from './application/facades/publishing-facade';
import { PublishingFacadePort } from './application/facades/publishing-facade-port';
import { ArticleRepository } from './infrastructure/repositories/article.repository';
import { CategoryRepository } from './infrastructure/repositories/category.repository';
import { NewsletterRepository } from './infrastructure/repositories/newsletter.repository';
import { TagRepository } from './infrastructure/repositories/tag.repository';
import { AdminArticlesController } from './presentation/admin-articles.controller';
import { ArticlesController } from './presentation/articles.controller';
import { CategoriesController } from './presentation/categories.controller';
import { NewsletterController } from './presentation/newsletter.controller';
import { TagsController } from './presentation/tags.controller';

const HANDLERS = [
  CreateArticleHandler,
  UpdateArticleHandler,
  PublishArticleHandler,
  ListArticlesHandler,
  GetArticleHandler,
  ListAdminArticlesHandler,
  GetAdminArticleHandler,
  CreateCategoryHandler,
  UpdateCategoryHandler,
  ListCategoriesHandler,
  CreateTagHandler,
  UpdateTagHandler,
  ListTagsHandler,
  SubscribeNewsletterHandler,
];

/**
 * Publishing bounded context (schema: publishing) — M7 content path:
 * public article/taxonomy reads, staff authoring with draft reads, SEO
 * metadata, related feed, newsletter capture, and the three publishing
 * integration events.
 */
@Module({
  imports: [CqrsModule, ClinicContentModule, StorageModule],
  controllers: [
    ArticlesController,
    AdminArticlesController,
    CategoriesController,
    TagsController,
    NewsletterController,
  ],
  providers: [
    ArticleRepository,
    CategoryRepository,
    TagRepository,
    NewsletterRepository,
    ArticlePresenter,
    { provide: IntegrationEventPublisher, useClass: InProcessEventPublisher },
    ...HANDLERS,
    PublishingFacade,
    { provide: PublishingFacadePort, useExisting: PublishingFacade },
  ],
  exports: [PublishingFacadePort],
})
export class PublishingModule {}
