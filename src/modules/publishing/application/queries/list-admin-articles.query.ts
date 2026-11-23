/** GET /admin/articles filters — staff draft reads across every status. */
export interface AdminArticleListFilters {
  status?: string;
  q?: string;
  category?: string;
  tag?: string;
}

export class ListAdminArticlesQuery {
  constructor(
    public readonly limit: number,
    public readonly cursor?: string,
    public readonly filters: AdminArticleListFilters = {},
  ) {}
}
