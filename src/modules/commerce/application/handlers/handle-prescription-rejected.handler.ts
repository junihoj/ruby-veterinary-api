import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { PrescriptionRejected } from '../../../pharmacy-authorisation/application/events/prescription-rejected.event';
import { PaymentRepository } from '../../infrastructure/repositories/payment.repository';

/**
 * Commerce consumes `PrescriptionRejected` (Flow 4 / api-specification
 * Pharmacy rules): the held order is cancelled, its reserved stock
 * released, and a captured payment refunded (pending intents fail). The
 * claim is a guarded `awaiting_prescription → cancelled` update — repeats
 * (re-delivered events) are no-ops.
 */
@EventsHandler(PrescriptionRejected)
export class HandlePrescriptionRejectedHandler implements IEventHandler<PrescriptionRejected> {
  constructor(private readonly payments: PaymentRepository) {}

  async handle(event: PrescriptionRejected): Promise<void> {
    const payload = event.payload;
    const orderId = PrefixedId.tryAnyToUuid(payload.orderId);
    if (!orderId) return;
    await this.payments.cancelHeldOrder(orderId, 'prescription_rejected');
  }
}
