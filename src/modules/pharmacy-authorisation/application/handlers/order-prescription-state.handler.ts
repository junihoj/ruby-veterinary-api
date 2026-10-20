import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  GetOrderPrescriptionStatusQuery,
  IsOrderApprovedQuery,
} from '../queries/order-prescription-state.query';
import { PrescriptionRequestRepository } from '../../infrastructure/repositories/prescription-request.repository';

/**
 * Commerce-facing order Rx state, read through the facade port (§10 rule 5
 * — commerce never touches the pharmacy schema). Aggregate precedence:
 * a rejection wins (the order is cancelled), then any open hold, then
 * approval; `null` means the order carries no Rx lines at all.
 */
@QueryHandler(GetOrderPrescriptionStatusQuery)
export class GetOrderPrescriptionStatusHandler implements IQueryHandler<GetOrderPrescriptionStatusQuery> {
  constructor(private readonly requests: PrescriptionRequestRepository) {}

  async execute(
    query: GetOrderPrescriptionStatusQuery,
  ): Promise<string | null> {
    const rows = await this.requests.findByOrder(query.orderId);
    if (rows.length === 0) return null;
    if (rows.some((row) => row.status === 'rejected')) return 'rejected';
    if (
      rows.some((row) => row.status === 'pending' || row.status === 'queried')
    ) {
      return 'pending';
    }
    if (rows.every((row) => row.status === 'approved')) return 'approved';
    return 'cancelled';
  }
}

/**
 * The capture release gate: an order may move to `paid` only when every one
 * of its prescription requests is approved (Flow 4 invariant — no code path
 * moves an Rx order to paid without pharmacy events).
 */
@QueryHandler(IsOrderApprovedQuery)
export class IsOrderApprovedHandler implements IQueryHandler<IsOrderApprovedQuery> {
  constructor(private readonly requests: PrescriptionRequestRepository) {}

  async execute(query: IsOrderApprovedQuery): Promise<boolean> {
    const rows = await this.requests.findByOrder(query.orderId);
    if (rows.length === 0) return true; // No Rx lines — nothing to gate.
    return rows.every((row) => row.status === 'approved');
  }
}
