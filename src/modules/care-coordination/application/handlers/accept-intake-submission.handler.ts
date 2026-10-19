import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import {
  ClientRecordsFacadePort,
  type FileIntakeResult,
} from '../../../client-patient-records/application/facades/client-records-facade-port';
import { FileIntakeCommand } from '../../../client-patient-records/application/commands/file-intake.command';
import { AcceptIntakeSubmissionCommand } from '../commands/accept-intake-submission.command';
import { AcceptIntakeResultDto } from '../dto/care.responses.dto';
import { IntakeComplete } from '../events/intake-complete.event';
import { intakeNotAcceptable, notFound, stateConflict } from '../errors';
import { IntakeSubmissionRepository } from '../../infrastructure/repositories/intake-submission.repository';

/**
 * POST /admin/clients/intake/{id}/accept — the Flow 2 normative sequence.
 *
 * The Client and Pet rows are written exclusively through the Client &
 * Patient Records context module (facade call), never by a direct
 * cross-schema write. Ordering is claim → file → publish: the conditional
 * status claim is the cross-schema mutex (a concurrent accept loses there
 * with 409 before any client row exists), and a filing failure reverts the
 * claim so staff can retry. `existingClient` submissions must point at an
 * existing client (422 INTAKE_NOT_ACCEPTABLE without one) instead of
 * creating a duplicate.
 */
@CommandHandler(AcceptIntakeSubmissionCommand)
export class AcceptIntakeSubmissionHandler implements ICommandHandler<AcceptIntakeSubmissionCommand> {
  constructor(
    private readonly submissions: IntakeSubmissionRepository,
    private readonly clientRecords: ClientRecordsFacadePort,
    private readonly events: IntegrationEventPublisher,
  ) {}

  async execute(
    command: AcceptIntakeSubmissionCommand,
  ): Promise<AcceptIntakeResultDto> {
    const uuid = PrefixedId.tryAnyToUuid(command.id);
    if (uuid === null) throw notFound('Intake submission not found.');
    const row = await this.submissions.findById(uuid);
    if (!row) throw notFound('Intake submission not found.');
    if (row.status === 'accepted' || row.status === 'rejected') {
      throw stateConflict(
        `Intake submission is '${row.status}' and can no longer be accepted.`,
      );
    }

    if (row.existingClient && !command.input.clientId) {
      throw intakeNotAcceptable(
        'This submission is flagged as an existing client — provide the clientId to attach the pets to.',
      );
    }

    // Cross-schema mutex: only one accept may move received/in_review →
    // accepted. Losing that race answers 409 before any client row exists.
    const claimed = await this.submissions.claimAcceptance(uuid, [
      'received',
      'in_review',
    ]);
    if (!claimed) {
      throw stateConflict(
        'Intake submission was accepted or rejected concurrently.',
      );
    }

    let filed: FileIntakeResult;
    try {
      filed = await this.clientRecords.fileIntake(
        new FileIntakeCommand(
          command.input.clientId ?? null,
          row.userId,
          {
            displayName: row.contactName,
            email: row.contactEmail,
            phone: row.contactPhone,
            addressLine1: row.addressLine1,
            addressLine2: row.addressLine2,
            city: row.city,
            postalCode: row.postalCode,
            country: row.country,
          },
          command.input.pets,
        ),
      );
    } catch (error) {
      // No cross-schema transaction exists — revert the claim so the
      // submission is retryable rather than stuck 'accepted' unfilled.
      await this.submissions.revertStatus(uuid, row.status);
      throw error;
    }

    this.events.publish(
      new IntakeComplete({
        intakeSubmissionId: PrefixedId.format('intakeSubmission', row.id),
        clientId: filed.clientId,
        petIds: filed.pets.map((pet) => pet.id),
        userId: row.userId,
      }),
    );

    return { status: 'accepted', clientId: filed.clientId, pets: filed.pets };
  }
}
