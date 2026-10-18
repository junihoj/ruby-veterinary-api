import { CreateSubscriptionDto } from '../dto/commerce.requests.dto';

/** POST /subscriptions — physical simple/variable auto-refill only (M3b). */
export class CreateSubscriptionCommand {
  constructor(
    public readonly userId: string,
    public readonly input: CreateSubscriptionDto,
  ) {}
}
