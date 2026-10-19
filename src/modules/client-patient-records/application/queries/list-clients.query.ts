export class ListClientsQuery {
  constructor(
    readonly status: string | null,
    readonly q: string | null,
    readonly limit: number,
    readonly cursor: string | undefined,
  ) {}
}
