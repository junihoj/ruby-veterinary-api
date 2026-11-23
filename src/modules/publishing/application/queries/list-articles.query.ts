/** GET /articles filters. Unknown slugs simply return an empty page. */
export interface ArticleListFilters {
  category?: string;
  tag?: string;
}

export class ListArticlesQuery {
  constructor(
    public readonly limit: number,
    public readonly cursor?: string,
    public readonly filters: ArticleListFilters = {},
  ) {}
}
