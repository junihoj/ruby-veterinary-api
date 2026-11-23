import { IntegrationEvent } from '../../../../shared/integration/integration-event';

/** Raised when a new address is captured or an unsubscribed one re-subscribes. */
export interface NewsletterSubscribedPayload {
  subscriberId: string;
  source: string | null;
}

export class NewsletterSubscribed extends IntegrationEvent<NewsletterSubscribedPayload> {
  readonly eventName = 'NewsletterSubscribed';
}
