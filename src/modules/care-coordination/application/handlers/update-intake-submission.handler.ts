import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { UpdateIntakeSubmissionCommand } from '../commands/update-intake-submission.command';
import { toIntakeSubmissionDto } from '../dto/care.mapper';
import { IntakeSubmissionDto } from '../dto/care.responses.dto';
import { notFound, stateConflict } from '../errors';
import { IntakeSubmissionRepository } from '../../infrastructure/repositories/intake-submission.repository';

/**
 * Status lifecycle for the review PATCH (intake.yaml updateIntakeSubmission):
 * received → in_review → accepted | rejected, with in_review and rejected
 * both reachable directly from received. `accepted` is only ever reached
 * through the accept operation (which files the client and pets), so it can
 * never be set here. Anything else is 409 STATE_CONFLICT.
 */
const INTAKE_TRANSITIONS: Record<string, readonly string[]> = {
  received: ['in_review', 'rejected'],
  in_review: ['rejected'],
  accepted: [],
  rejected: [],
};

@CommandHandler(UpdateIntakeSubmissionCommand)
export class UpdateIntakeSubmissionHandler implements ICommandHandler<UpdateIntakeSubmissionCommand> {
  constructor(private readonly submissions: IntakeSubmissionRepository) {}

  async execute(
    command: UpdateIntakeSubmissionCommand,
  ): Promise<IntakeSubmissionDto> {
    const uuid = PrefixedId.tryAnyToUuid(command.id);
    if (uuid === null) throw notFound('Intake submission not found.');
    const row = await this.submissions.findById(uuid);
    if (!row) throw notFound('Intake submission not found.');

    const allowed = INTAKE_TRANSITIONS[row.status] ?? [];
    if (!allowed.includes(command.input.status)) {
      throw stateConflict(
        `Cannot move an intake submission from '${row.status}' to '${command.input.status}'.`,
      );
    }

    const updated = await this.submissions.updateStatus(
      uuid,
      command.input.status,
    );
    return toIntakeSubmissionDto(updated);
  }
}
