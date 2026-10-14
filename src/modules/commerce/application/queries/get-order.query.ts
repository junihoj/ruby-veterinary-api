/** GET /orders/{id} — a single owned order (404 for anyone else's). */
export class GetOrderQuery {
  constructor(
    public readonly userId: string,
    public readonly orderId: string,
  ) {}
}
