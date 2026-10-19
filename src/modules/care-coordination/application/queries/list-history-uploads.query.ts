export interface HistoryUploadFilters {
  status: string | null;
  appointmentRequestId: string | null;
  intakeSubmissionId: string | null;
}

export class ListHistoryUploadsQuery {
  constructor(
    readonly filters: HistoryUploadFilters,
    readonly limit: number,
    readonly cursor: string | undefined,
  ) {}
}
