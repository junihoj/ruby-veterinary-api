import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { PrescriptionApproved } from '../../../pharmacy-authorisation/application/events/prescription-approved.event';
import { PaymentRepository } from '../../infrastructure/repositories/payment.repository';

/**
 * Commerce consumes `PrescriptionApproved` (Flow 4): approval releases the
 * hold only when the money is already in — the `awaiting_prescription`
 * order flips to `paid` (stock settled at capture). Payment captured later
 * is released by the webhook gate instead (confirmCapture `releaseHeld`),
 * so both approval/payment orderings converge on the same idempotent flip.
 */
@EventsHandler(PrescriptionApproved)
export class ReleaseRxOrderHandler implements IEventHandler<PrescriptionApproved> {
  constructor(private readonly payments: PaymentRepository) {}

  async handle(event: PrescriptionApproved): Promise<void> {
    const payload = event.payload;
    const orderId = PrefixedId.tryAnyToUuid(payload.orderId);
    if (!orderId) return;
    await this.payments.releaseCapturedHeldOrder(orderId);
  }
}
