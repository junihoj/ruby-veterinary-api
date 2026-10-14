/** Product detail page by slug (public, cacheable). */
export class GetProductQuery {
  constructor(public readonly slug: string) {}
}
