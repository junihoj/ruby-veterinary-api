import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { QueryPrescriptionCommand } from '../commands/query-prescription.command';
import { toPrescriptionRequestDto } from '../dto/pharmacy.mapper';
import { PrescriptionRequestDto } from '../dto/pharmacy.responses.dto';
import { PrescriptionQueried } from '../events/prescription-queried.event';
import { badRequest, notFound, stateConflict } from '../errors';
import { requireVeterinarian } from './approve-prescription.handler';
import { PrescriptionRequestRepository } from '../../infrastructure/repositories/prescription-request.repository';

/**
 * POST /prescriptions/{id}/query — asks for more information; the request
 * stays open (`pending → queried`) and can still be approved or rejected
 * (queried → approved | rejected per data-model/pharmacy-authorisation.md).
 * Querying an already-queried request is a no-op transition → 409.
 */
@CommandHandler(QueryPrescriptionCommand)
export class QueryPrescriptionHandler implements ICommandHandler<QueryPrescriptionCommand> {
  constructor(
    private readonly requests: PrescriptionRequestRepository,
    private readonly events: IntegrationEventPublisher,
  ) {}

  async execute(
    command: QueryPrescriptionCommand,
  ): Promise<PrescriptionRequestDto> {
    requireVeterinarian(command.actor);
    if (!command.reasonText.trim()) {
      throw badRequest('A question for the owner is required.');
    }
    const uuid = PrefixedId.tryAnyToUuid(command.id);
    if (uuid === null) throw notFound('Prescription request not found.');
    const row = await this.requests.findById(uuid);
    if (!row) throw notFound('Prescription request not found.');

    const actorUuid =
      PrefixedId.tryAnyToUuid(command.actor.id) ?? command.actor.id;
    const claimed = await this.requests.recordDecision({
      requestId: uuid,
      allowedFrom: ['pending'],
      to: 'queried',
      decision: {
        prescriptionRequestId: uuid,
        decision: 'query',
        reasonCode: command.reasonCode,
        reasonText: command.reasonText,
        decidedBy: actorUuid,
        decidedAt: new Date(),
      },
      audit: {
        prescriptionRequestId: uuid,
        actorUserId: actorUuid,
        action: 'decision_recorded',
        detailJson: { decision: 'query', reasonCode: command.reasonCode },
        requestId: command.requestId,
      },
    });
    if (!claimed) {
      throw stateConflict('This prescription request is already decided.');
    }

    const updated = await this.requests.findById(uuid);
    this.events.publish(
      new PrescriptionQueried({
        prescriptionRequestId: PrefixedId.format('prescriptionRequest', uuid),
        orderId: PrefixedId.format('order', row.orderId),
        veterinarianUserId: command.actor.id,
        reasonCode: command.reasonCode,
        question: command.reasonText,
      }),
    );
    return toPrescriptionRequestDto(updated ?? row);
  }
}
