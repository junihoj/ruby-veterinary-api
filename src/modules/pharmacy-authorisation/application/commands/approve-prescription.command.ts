/** Staff actor as resolved by the shared AuthGuard (id + role claims). */
export interface DecisionActor {
  readonly id: string;
  readonly roles: readonly string[];
}

export class ApprovePrescriptionCommand {
  constructor(
    readonly id: string,
    readonly actor: DecisionActor,
    readonly note: string | null,
    /** API requestId for rx_audit_log correlation (ADR-0012). */
    readonly requestId: string | null,
  ) {}
}
