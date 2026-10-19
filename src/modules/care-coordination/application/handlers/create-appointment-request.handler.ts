import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { CreateAppointmentRequestCommand } from '../commands/create-appointment-request.command';
import { CreateAppointmentRequestResultDto } from '../dto/care.responses.dto';
import { AppointmentRequested } from '../events/appointment-requested.event';
import { FormAlertService } from '../form-alert.service';
import { AppointmentRequestRepository } from '../../infrastructure/repositories/appointment-request.repository';

/**
 * POST /appointment-requests (Flow 1): files the owner's request, then —
 * after the row commits — routes the dashboard/email alerts and publishes
 * `AppointmentRequested`. The alert step never throws; the event follows.
 */
@CommandHandler(CreateAppointmentRequestCommand)
export class CreateAppointmentRequestHandler implements ICommandHandler<CreateAppointmentRequestCommand> {
  constructor(
    private readonly requests: AppointmentRequestRepository,
    private readonly alerts: FormAlertService,
    private readonly events: IntegrationEventPublisher,
  ) {}

  async execute(
    command: CreateAppointmentRequestCommand,
  ): Promise<CreateAppointmentRequestResultDto> {
    const row = await this.requests.create({
      userId: command.userId,
      contactName: command.input.contactName,
      contactPhone: command.input.contactPhone,
      contactEmail: command.input.contactEmail,
      petName: command.input.petName,
      petSpecies: command.input.petSpecies ?? null,
      reason: command.input.reason,
      preferredWindowStart: command.input.preferredWindowStart
        ? new Date(command.input.preferredWindowStart)
        : null,
      preferredWindowEnd: command.input.preferredWindowEnd
        ? new Date(command.input.preferredWindowEnd)
        : null,
      urgency: command.input.urgency ?? 'routine',
    });
    const id = PrefixedId.format('appointmentRequest', row.id);

    await this.alerts.raise({
      sourceType: 'appointment_request',
      sourceId: row.id,
      subject: `Appointment request: ${row.petName} (${row.urgency})`,
      body:
        `${row.contactName} <${row.contactEmail}> · ${row.contactPhone}\n` +
        `Pet: ${row.petName}${row.petSpecies ? ` (${row.petSpecies})` : ''}\n` +
        `Urgency: ${row.urgency}\n\n${row.reason}`,
    });

    this.events.publish(
      new AppointmentRequested({
        appointmentRequestId: id,
        contactName: row.contactName,
        contactPhone: row.contactPhone,
        contactEmail: row.contactEmail,
        petName: row.petName,
        petSpecies: row.petSpecies,
        reason: row.reason,
        urgency: row.urgency,
        preferredWindowStart: row.preferredWindowStart
          ? row.preferredWindowStart.toISOString()
          : null,
        preferredWindowEnd: row.preferredWindowEnd
          ? row.preferredWindowEnd.toISOString()
          : null,
      }),
    );

    return { appointmentRequestId: id, status: row.status };
  }
}
