/** GET /orders — the caller's order history. */
export class ListOrdersQuery {
  constructor(
    public readonly userId: string,
    public readonly limit: number,
    public readonly cursor?: string,
  ) {}
}
