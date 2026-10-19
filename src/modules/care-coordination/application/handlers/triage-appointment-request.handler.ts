import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { TriageAppointmentRequestCommand } from '../commands/triage-appointment-request.command';
import { toAppointmentRequestDto } from '../dto/care.mapper';
import { AppointmentRequestDto } from '../dto/care.responses.dto';
import { notFound, stateConflict } from '../errors';
import { AppointmentRequestRepository } from '../../infrastructure/repositories/appointment-request.repository';

/** Status lifecycle (intake.yaml triageAppointmentRequest). */
const APPOINTMENT_TRANSITIONS: Record<string, readonly string[]> = {
  received: ['triaged', 'scheduled', 'declined', 'cancelled'],
  triaged: ['scheduled', 'declined', 'cancelled'],
  scheduled: ['cancelled'],
  declined: [],
  cancelled: [],
};

/**
 * PATCH /admin/appointment-requests/{id}: received → triaged → scheduled |
 * declined, cancellable from any non-terminal state. `urgency` never
 * overrides triage. Any other move is 409 STATE_CONFLICT.
 */
@CommandHandler(TriageAppointmentRequestCommand)
export class TriageAppointmentRequestHandler implements ICommandHandler<TriageAppointmentRequestCommand> {
  constructor(private readonly requests: AppointmentRequestRepository) {}

  async execute(
    command: TriageAppointmentRequestCommand,
  ): Promise<AppointmentRequestDto> {
    const uuid = PrefixedId.tryAnyToUuid(command.id);
    if (uuid === null) throw notFound('Appointment request not found.');
    const row = await this.requests.findById(uuid);
    if (!row) throw notFound('Appointment request not found.');

    const allowed = APPOINTMENT_TRANSITIONS[row.status] ?? [];
    if (!allowed.includes(command.input.status)) {
      throw stateConflict(
        `Cannot move an appointment request from '${row.status}' to '${command.input.status}'.`,
      );
    }

    const updated = await this.requests.updateStatus(
      uuid,
      command.input.status,
    );
    return toAppointmentRequestDto(updated);
  }
}
