/** DELETE /cart/items?itemId= — ownership-scoped, idempotent removal. */
export class RemoveCartItemCommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string,
  ) {}
}
