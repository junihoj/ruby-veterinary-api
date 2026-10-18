import { UpdateSubscriptionDto } from '../dto/commerce.requests.dto';

/** PATCH /subscriptions/{id} — pause, resume, or cancel (M3b). */
export class UpdateSubscriptionCommand {
  constructor(
    public readonly userId: string,
    public readonly subscriptionId: string,
    public readonly input: UpdateSubscriptionDto,
  ) {}
}
