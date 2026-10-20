import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { RejectPrescriptionCommand } from '../commands/reject-prescription.command';
import { toPrescriptionRequestDto } from '../dto/pharmacy.mapper';
import { PrescriptionRequestDto } from '../dto/pharmacy.responses.dto';
import { PrescriptionRejected } from '../events/prescription-rejected.event';
import { notFound, stateConflict } from '../errors';
import { requireVeterinarian } from './approve-prescription.handler';
import { PrescriptionRequestRepository } from '../../infrastructure/repositories/prescription-request.repository';

/**
 * POST /prescriptions/{id}/reject — terminal for the request. The order
 * consequence (cancel + release stock + refund if captured) is Commerce's
 * to apply from the PrescriptionRejected event; sibling open requests of
 * the same order are cancelled here so the hold can never dangle.
 */
@CommandHandler(RejectPrescriptionCommand)
export class RejectPrescriptionHandler implements ICommandHandler<RejectPrescriptionCommand> {
  constructor(
    private readonly requests: PrescriptionRequestRepository,
    private readonly events: IntegrationEventPublisher,
  ) {}

  async execute(
    command: RejectPrescriptionCommand,
  ): Promise<PrescriptionRequestDto> {
    requireVeterinarian(command.actor);
    const uuid = PrefixedId.tryAnyToUuid(command.id);
    if (uuid === null) throw notFound('Prescription request not found.');
    const row = await this.requests.findById(uuid);
    if (!row) throw notFound('Prescription request not found.');

    const actorUuid =
      PrefixedId.tryAnyToUuid(command.actor.id) ?? command.actor.id;
    const claimed = await this.requests.recordDecision({
      requestId: uuid,
      allowedFrom: ['pending', 'queried'],
      to: 'rejected',
      decision: {
        prescriptionRequestId: uuid,
        decision: 'reject',
        reasonCode: command.reasonCode,
        reasonText: command.reasonText,
        decidedBy: actorUuid,
        decidedAt: new Date(),
      },
      audit: {
        prescriptionRequestId: uuid,
        actorUserId: actorUuid,
        action: 'decision_recorded',
        detailJson: { decision: 'reject', reasonCode: command.reasonCode },
        requestId: command.requestId,
      },
    });
    if (!claimed) {
      throw stateConflict('This prescription request is already decided.');
    }
    await this.requests.cancelSiblings(uuid, row.orderId);

    const updated = await this.requests.findById(uuid);
    this.events.publish(
      new PrescriptionRejected({
        prescriptionRequestId: PrefixedId.format('prescriptionRequest', uuid),
        orderId: PrefixedId.format('order', row.orderId),
        veterinarianUserId: command.actor.id,
        reasonCode: command.reasonCode,
        reasonText: command.reasonText,
      }),
    );
    return toPrescriptionRequestDto(updated ?? row);
  }
}
