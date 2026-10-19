export class ListAppointmentRequestsQuery {
  constructor(
    readonly status: string | null,
    readonly limit: number,
    readonly cursor: string | undefined,
  ) {}
}
