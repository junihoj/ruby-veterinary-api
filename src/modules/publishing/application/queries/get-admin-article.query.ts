/** GET /admin/articles/{id} — staff detail for drafts and archives. */
export class GetAdminArticleQuery {
  constructor(public readonly id: string) {}
}
