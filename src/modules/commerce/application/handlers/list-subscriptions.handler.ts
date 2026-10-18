import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { SubscriptionRepository } from '../../infrastructure/repositories/subscription.repository';
import { toSubscriptionDto } from '../dto/commerce.mapper';
import { SubscriptionDto } from '../dto/commerce.responses.dto';
import { ListSubscriptionsQuery } from '../queries/list-subscriptions.query';

/** GET /subscriptions (M3b) — the caller's auto-refill rows, newest first. */
@QueryHandler(ListSubscriptionsQuery)
export class ListSubscriptionsHandler implements IQueryHandler<ListSubscriptionsQuery> {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async execute(query: ListSubscriptionsQuery): Promise<SubscriptionDto[]> {
    const rows = await this.subscriptions.listByUser(query.userId);
    return rows.map(toSubscriptionDto);
  }
}
