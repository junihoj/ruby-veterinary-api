import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import {
  DecisionActor,
  ApprovePrescriptionCommand,
} from '../commands/approve-prescription.command';
import { toPrescriptionRequestDto } from '../dto/pharmacy.mapper';
import { PrescriptionRequestDto } from '../dto/pharmacy.responses.dto';
import { PrescriptionApproved } from '../events/prescription-approved.event';
import { notFound, prescriberRequired, stateConflict } from '../errors';
import { PrescriptionRequestRepository } from '../../infrastructure/repositories/prescription-request.repository';

/** Vet-only guard (pharmacy.yaml: PRESCRIBER_REQUIRED on decisions). */
export function requireVeterinarian(actor: DecisionActor): void {
  if (!actor.roles.includes('veterinarian')) {
    throw prescriberRequired(
      'Only a veterinarian can decide on a prescription request.',
    );
  }
}

/**
 * POST /prescriptions/{id}/approve — the only release valve of an Rx order
 * (api-specification Pharmacy rules). Decision row + status + audit row in
 * one transaction (ADR-0012); a terminal or concurrently decided request
 * answers 409 STATE_CONFLICT. PrescriptionApproved is published post-commit
 * — commerce consumes it, never a direct order-status write.
 */
@CommandHandler(ApprovePrescriptionCommand)
export class ApprovePrescriptionHandler implements ICommandHandler<ApprovePrescriptionCommand> {
  constructor(
    private readonly requests: PrescriptionRequestRepository,
    private readonly events: IntegrationEventPublisher,
  ) {}

  async execute(
    command: ApprovePrescriptionCommand,
  ): Promise<PrescriptionRequestDto> {
    requireVeterinarian(command.actor);
    const uuid = PrefixedId.tryAnyToUuid(command.id);
    if (uuid === null) throw notFound('Prescription request not found.');
    const row = await this.requests.findById(uuid);
    if (!row) throw notFound('Prescription request not found.');

    const claimed = await this.requests.recordDecision({
      requestId: uuid,
      allowedFrom: ['pending', 'queried'],
      to: 'approved',
      decision: {
        prescriptionRequestId: uuid,
        decision: 'approve',
        reasonCode: null,
        reasonText: command.note,
        decidedBy:
          PrefixedId.tryAnyToUuid(command.actor.id) ?? command.actor.id,
        decidedAt: new Date(),
      },
      audit: {
        prescriptionRequestId: uuid,
        actorUserId:
          PrefixedId.tryAnyToUuid(command.actor.id) ?? command.actor.id,
        action: 'decision_recorded',
        detailJson: { decision: 'approve' },
        requestId: command.requestId,
      },
    });
    if (!claimed) {
      throw stateConflict('This prescription request is already decided.');
    }

    const updated = await this.requests.findById(uuid);
    this.events.publish(
      new PrescriptionApproved({
        prescriptionRequestId: PrefixedId.format('prescriptionRequest', uuid),
        orderId: PrefixedId.format('order', row.orderId),
        veterinarianUserId: command.actor.id,
        note: command.note,
      }),
    );
    return toPrescriptionRequestDto(updated ?? row);
  }
}
