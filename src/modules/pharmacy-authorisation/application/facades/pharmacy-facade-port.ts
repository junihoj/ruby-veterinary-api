import type { ApprovePrescriptionCommand } from '../commands/approve-prescription.command';
import type { QueryPrescriptionCommand } from '../commands/query-prescription.command';
import type { RejectPrescriptionCommand } from '../commands/reject-prescription.command';
import type { SubmitPrescriptionHoldCommand } from '../commands/submit-prescription-hold.command';
import type {
  PagedResult,
  PrescriptionQueueItemDto,
  PrescriptionRequestDto,
  PrescriptionRequestDetailDto,
} from '../dto/pharmacy.responses.dto';
import type { GetPrescriptionRequestQuery } from '../queries/get-prescription-request.query';
import type { ListPrescriptionQueueQuery } from '../queries/list-prescription-queue.query';

/**
 * Public API of the PharmacyAuthorisation context (§6.1). Other modules depend only on this
 * abstract port, bound to the concrete facade with `useExisting` (§3).
 *
 * Schema: pharmacy. Consumers:
 * - commerce — `submitHold` places the Rx hold at checkout, `getOrderStatus`
 *   fills `OrderDto.prescriptionStatus`, `isApproved` gates the capture
 *   release to `paid` (Flow 4: commerce never reads the pharmacy schema).
 */
export abstract class PharmacyFacadePort {
  /** Checkout places the hold synchronously (Flow 4); idempotent per order. */
  abstract submitHold(
    command: SubmitPrescriptionHoldCommand,
  ): Promise<PrescriptionRequestDto[]>;
  abstract listQueue(
    query: ListPrescriptionQueueQuery,
  ): Promise<PagedResult<PrescriptionQueueItemDto>>;
  abstract getRequest(
    query: GetPrescriptionRequestQuery,
  ): Promise<PrescriptionRequestDetailDto>;
  abstract approve(
    command: ApprovePrescriptionCommand,
  ): Promise<PrescriptionRequestDto>;
  abstract reject(
    command: RejectPrescriptionCommand,
  ): Promise<PrescriptionRequestDto>;
  abstract query(
    command: QueryPrescriptionCommand,
  ): Promise<PrescriptionRequestDto>;
  /** Aggregate Rx state of an order, or null when the order has no Rx lines. */
  abstract getOrderStatus(orderId: string): Promise<string | null>;
  /** True when every prescription request of the order is approved. */
  abstract isApproved(orderId: string): Promise<boolean>;
}
