/** Batch published staff-profile lookup (M7 article-list author enrichment). */
export class ListStaffProfilesByIdsQuery {
  constructor(public readonly ids: string[]) {}
}
