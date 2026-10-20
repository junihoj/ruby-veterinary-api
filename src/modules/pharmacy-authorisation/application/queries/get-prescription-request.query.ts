export class GetPrescriptionRequestQuery {
  constructor(
    readonly id: string,
    readonly actorUserId: string,
    /** API requestId for rx_audit_log correlation (nullable outside HTTP). */
    readonly requestId: string | null,
  ) {}
}
