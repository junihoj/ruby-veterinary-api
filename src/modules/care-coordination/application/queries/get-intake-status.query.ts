export class GetIntakeStatusQuery {
  constructor(
    readonly id: string,
    /** Owner-scoped: strangers' submissions answer 404. */
    readonly userId: string,
  ) {}
}
