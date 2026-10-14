/** GET /products filters (commerce.yaml listProducts). */
export interface ProductListFilters {
  category?: string;
  petType?: string;
  lifeStage?: string;
  condition?: string;
  q?: string;
}

/** Filterable product list (public, cacheable). */
export class ListProductsQuery {
  constructor(
    public readonly limit: number,
    public readonly cursor?: string,
    public readonly filters: ProductListFilters = {},
  ) {}
}
