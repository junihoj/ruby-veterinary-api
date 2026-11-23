/** GET /articles/{slug} — published only. */
export class GetArticleQuery {
  constructor(public readonly slug: string) {}
}
