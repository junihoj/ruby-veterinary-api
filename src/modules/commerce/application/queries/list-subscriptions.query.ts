/** GET /subscriptions — the caller's auto-refill rows (M3b). */
export class ListSubscriptionsQuery {
  constructor(public readonly userId: string) {}
}
