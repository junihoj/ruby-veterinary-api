/** POST /articles/{id}/publish — idempotent publish. */
export class PublishArticleCommand {
  constructor(public readonly id: string) {}
}
