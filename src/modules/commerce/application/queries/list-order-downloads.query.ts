/** GET /orders/{id}/downloads — file-level grants on an owned order (M3b). */
export class ListOrderDownloadsQuery {
  constructor(
    public readonly userId: string,
    public readonly orderId: string,
  ) {}
}
