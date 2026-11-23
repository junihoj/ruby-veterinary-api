import { IntegrationEvent } from '../../../../shared/integration/integration-event';

/** Raised when a published article moves back to draft or archived. */
export interface ArticleUnpublishedPayload {
  articleId: string;
  reason: 'draft' | 'archived';
}

export class ArticleUnpublished extends IntegrationEvent<ArticleUnpublishedPayload> {
  readonly eventName = 'ArticleUnpublished';
}
