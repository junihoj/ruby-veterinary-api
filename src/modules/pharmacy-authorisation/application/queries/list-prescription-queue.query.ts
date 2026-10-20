export class ListPrescriptionQueueQuery {
  constructor(
    readonly status: 'pending' | 'queried' | null,
    readonly limit: number,
    readonly cursor: string | null,
  ) {}
}
