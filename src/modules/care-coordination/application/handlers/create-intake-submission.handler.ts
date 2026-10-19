import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { CreateIntakeSubmissionCommand } from '../commands/create-intake-submission.command';
import { CreateIntakeSubmissionResultDto } from '../dto/care.responses.dto';
import { IntakeSubmitted } from '../events/intake-submitted.event';
import { badRequest } from '../errors';
import { FormAlertService } from '../form-alert.service';
import { HistoryUploadRepository } from '../../infrastructure/repositories/history-upload.repository';
import { IntakeSubmissionRepository } from '../../infrastructure/repositories/intake-submission.repository';

/**
 * POST /clients/intake (Flow 1): files the submission and links its pending
 * history uploads (validated owner-side first: present, pending, unlinked,
 * and signed by this user). Post-commit it routes alerts and publishes
 * `IntakeSubmitted`.
 */
@CommandHandler(CreateIntakeSubmissionCommand)
export class CreateIntakeSubmissionHandler implements ICommandHandler<CreateIntakeSubmissionCommand> {
  constructor(
    private readonly submissions: IntakeSubmissionRepository,
    private readonly uploads: HistoryUploadRepository,
    private readonly alerts: FormAlertService,
    private readonly events: IntegrationEventPublisher,
  ) {}

  async execute(
    command: CreateIntakeSubmissionCommand,
  ): Promise<CreateIntakeSubmissionResultDto> {
    const rawIds = command.input.historyUploadIds ?? [];
    const uploadIds: string[] = [];
    for (const raw of rawIds) {
      const uuid = PrefixedId.tryAnyToUuid(raw);
      if (uuid === null) throw badRequest('Unknown upload id.');
      if (uploadIds.includes(uuid)) {
        throw badRequest('Duplicate upload id in historyUploadIds.');
      }
      uploadIds.push(uuid);
    }

    if (uploadIds.length > 0) {
      // Anonymous submitters cannot have signed uploads (sign is Bearer), so
      // a null owner fails the ownership check below just like a stranger's.
      const rows = await this.uploads.findManyByIds(uploadIds);
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const uuid of uploadIds) {
        const row = byId.get(uuid);
        if (
          !row ||
          row.status !== 'pending' ||
          row.appointmentRequestId !== null ||
          row.intakeSubmissionId !== null ||
          row.uploadedByUserId === null ||
          row.uploadedByUserId !== command.userId
        ) {
          throw badRequest(
            'One or more historyUploadIds are missing, already linked, or not yours.',
          );
        }
      }
    }

    let preferredVetUserId: string | null = null;
    if (command.input.preferredVetUserId) {
      preferredVetUserId = PrefixedId.tryAnyToUuid(
        command.input.preferredVetUserId,
      );
      if (preferredVetUserId === null) {
        throw badRequest('Unknown preferredVetUserId.');
      }
    }

    let row: Awaited<ReturnType<IntakeSubmissionRepository['create']>>;
    try {
      row = await this.submissions.create(
        {
          userId: command.userId,
          contactName: command.input.contactName,
          contactPhone: command.input.contactPhone,
          contactEmail: command.input.contactEmail,
          addressLine1: command.input.addressLine1 ?? null,
          addressLine2: command.input.addressLine2 ?? null,
          city: command.input.city ?? null,
          postalCode: command.input.postalCode ?? null,
          country: command.input.country ?? null,
          existingClient: command.input.existingClient ?? false,
          preferredVetUserId,
          notes: command.input.notes ?? null,
        },
        uploadIds,
      );
    } catch (error) {
      // A concurrent submission claimed one of the uploads between our
      // validation and the linking transaction — same 400, no partial rows.
      if (
        error instanceof Error &&
        error.message === 'INTAKE_UPLOAD_LINK_CONFLICT'
      ) {
        throw badRequest(
          'One or more historyUploadIds are missing, already linked, or not yours.',
        );
      }
      throw error;
    }

    const id = PrefixedId.format('intakeSubmission', row.id);
    const uploadIdStrings = row.uploads.map((upload) =>
      PrefixedId.format('historyUpload', upload.id),
    );

    await this.alerts.raise({
      sourceType: 'intake_submission',
      sourceId: row.id,
      subject: `New intake submission: ${row.contactName}`,
      body:
        `${row.contactName} <${row.contactEmail}> · ${row.contactPhone}\n` +
        `Existing client: ${row.existingClient ? 'yes' : 'no'}\n` +
        `History files: ${uploadIdStrings.length}\n\n${row.notes ?? ''}`,
    });

    this.events.publish(
      new IntakeSubmitted({
        intakeSubmissionId: id,
        contactName: row.contactName,
        contactPhone: row.contactPhone,
        contactEmail: row.contactEmail,
        userId: row.userId,
        existingClient: row.existingClient,
        uploadIds: uploadIdStrings,
      }),
    );

    return { intakeSubmissionId: id, status: row.status };
  }
}
