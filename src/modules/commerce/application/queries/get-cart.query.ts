/** GET /cart — the caller's open cart (empty shape when none exists yet). */
export class GetCartQuery {
  constructor(public readonly userId: string) {}
}
