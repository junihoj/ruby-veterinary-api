import { DecisionActor } from './approve-prescription.command';

export class QueryPrescriptionCommand {
  constructor(
    readonly id: string,
    readonly actor: DecisionActor,
    readonly reasonCode: string | null,
    readonly reasonText: string,
    /** API requestId for rx_audit_log correlation (ADR-0012). */
    readonly requestId: string | null,
  ) {}
}
