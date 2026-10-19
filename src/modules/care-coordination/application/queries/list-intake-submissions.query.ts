export class ListIntakeSubmissionsQuery {
  constructor(
    readonly status: string | null,
    readonly limit: number,
    readonly cursor: string | undefined,
  ) {}
}
