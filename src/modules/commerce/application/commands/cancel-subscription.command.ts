/** DELETE /subscriptions/{id} — cancel; unknown ids are 204 no-ops (M3b). */
export class CancelSubscriptionCommand {
  constructor(
    public readonly userId: string,
    public readonly subscriptionId: string,
  ) {}
}
