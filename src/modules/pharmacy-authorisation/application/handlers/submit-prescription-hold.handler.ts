import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { ClientRecordsFacadePort } from '../../../client-patient-records/application/facades/client-records-facade-port';
import { ListPrimaryVeterinariansQuery } from '../../../client-patient-records/application/queries/list-primary-veterinarians.query';
import { SubmitPrescriptionHoldCommand } from '../commands/submit-prescription-hold.command';
import { toPrescriptionRequestDto } from '../dto/pharmacy.mapper';
import { PrescriptionRequestDto } from '../dto/pharmacy.responses.dto';
import { PrescriptionRequested } from '../events/prescription-requested.event';
import { unprocessable } from '../errors';
import { PrescriptionRequestRepository } from '../../infrastructure/repositories/prescription-request.repository';
import type { PrescriptionRequest } from '../../../../generated/prisma/client';

/**
 * The pharmacy hold, placed synchronously by Commerce at checkout (Flow 4):
 * one pending request per order + pet + Rx line set. The pet's current
 * primary vet is resolved here — denormalised into
 * `veterinarian_user_id` at request time; a pet without a current link
 * answers 422 PRIMARY_VET_REQUIRED (commerce compensates the order away).
 * Idempotent per order: an existing hold replays as-is.
 */
@CommandHandler(SubmitPrescriptionHoldCommand)
export class SubmitPrescriptionHoldHandler implements ICommandHandler<SubmitPrescriptionHoldCommand> {
  constructor(
    private readonly requests: PrescriptionRequestRepository,
    private readonly clientRecords: ClientRecordsFacadePort,
    private readonly events: IntegrationEventPublisher,
  ) {}

  async execute(
    command: SubmitPrescriptionHoldCommand,
  ): Promise<PrescriptionRequestDto[]> {
    const existing = await this.requests.findByOrder(command.input.orderId);
    if (existing.length > 0) {
      return existing.map(toPrescriptionRequestDto);
    }

    const created: PrescriptionRequest[] = [];
    for (const group of command.input.petGroups) {
      const veterinarianUserId = await this.resolvePrimaryVet(group.petId);
      const row = await this.requests.create({
        orderId: command.input.orderId,
        orderItemIds: group.orderItemIds,
        userId: command.input.userId,
        petId: group.petId,
        veterinarianUserId,
        ownerNote: command.input.ownerNote,
      });
      created.push(row);
      // Published post-commit (each create is its own committed write) —
      // consumers are idempotent and dedupe by event id (§7).
      this.events.publish(
        new PrescriptionRequested({
          prescriptionRequestId: PrefixedId.format(
            'prescriptionRequest',
            row.id,
          ),
          orderId: PrefixedId.format('order', row.orderId),
          petId: PrefixedId.format('pet', row.petId),
          veterinarianUserId: PrefixedId.format('user', row.veterinarianUserId),
          orderItemIds: row.orderItemIds.map((id) =>
            PrefixedId.format('orderItem', id),
          ),
        }),
      );
    }
    return created.map(toPrescriptionRequestDto);
  }

  /** Current primary-vet link (effectiveTo null) — pharmacy guardrail input. */
  private async resolvePrimaryVet(petId: string): Promise<string> {
    let veterinarianUuid: string | null = null;
    try {
      const links = await this.clientRecords.listPrimaryVeterinarians(
        new ListPrimaryVeterinariansQuery(PrefixedId.format('pet', petId)),
      );
      const current = links.find((link) => link.effectiveTo === null);
      veterinarianUuid = current
        ? PrefixedId.tryAnyToUuid(current.veterinarianUserId)
        : null;
    } catch {
      // Unknown/deleted pet reads as "no prescriber on file".
      veterinarianUuid = null;
    }
    if (!veterinarianUuid) {
      throw unprocessable(
        'PRIMARY_VET_REQUIRED',
        'This pet has no current primary veterinarian on file; set one before ordering prescription items.',
      );
    }
    return veterinarianUuid;
  }
}
