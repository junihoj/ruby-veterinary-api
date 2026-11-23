import { IntegrationEvent } from '../../../../shared/integration/integration-event';

/** Raised when a draft or archived article transitions into published. */
export interface ArticlePublishedPayload {
  articleId: string;
  authorId: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  slug: string;
}

export class ArticlePublished extends IntegrationEvent<ArticlePublishedPayload> {
  readonly eventName = 'ArticlePublished';
}
