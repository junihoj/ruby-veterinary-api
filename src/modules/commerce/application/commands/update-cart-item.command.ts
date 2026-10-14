/** PATCH /cart/items?itemId= — set a line quantity (0 removes it). */
export class UpdateCartItemCommand {
  constructor(
    public readonly userId: string,
    public readonly itemId: string,
    public readonly quantity: number,
  ) {}
}
