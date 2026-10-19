import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ObjectStoragePort } from '../../../../shared/storage/object-storage.port';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { UpdateHistoryUploadCommand } from '../commands/update-history-upload.command';
import { toHistoryUploadDto } from '../dto/care.mapper';
import { HistoryUploadDto } from '../dto/care.responses.dto';
import { badRequest, notFound, stateConflict, uploadMissing } from '../errors';
import { HistoryUploadRepository } from '../../infrastructure/repositories/history-upload.repository';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { HistoryUploadReceived } from '../events/history-upload-received.event';

/**
 * PATCH /admin/uploads/{id} — staff review. Finalise HEAD-verifies the object
 * actually exists in SeaweedFS (the API never sees the owner's PUT complete):
 * absent → 422 UPLOAD_MISSING, leaving the row pending for a retry. Rejection
 * requires a reason. Revisiting a terminal upload is 409 STATE_CONFLICT;
 * finalising publishes `HistoryUploadReceived`.
 */
@CommandHandler(UpdateHistoryUploadCommand)
export class UpdateHistoryUploadHandler implements ICommandHandler<UpdateHistoryUploadCommand> {
  constructor(
    private readonly uploads: HistoryUploadRepository,
    private readonly storage: ObjectStoragePort,
    private readonly events: IntegrationEventPublisher,
  ) {}

  async execute(
    command: UpdateHistoryUploadCommand,
  ): Promise<HistoryUploadDto> {
    const uuid = PrefixedId.tryAnyToUuid(command.id);
    if (uuid === null) throw notFound('History upload not found.');
    const row = await this.uploads.findById(uuid);
    if (!row) throw notFound('History upload not found.');
    if (row.status !== 'pending') {
      throw stateConflict(`History upload is already '${row.status}'.`);
    }

    if (command.input.status === 'rejected') {
      const reason = command.input.rejectionReason?.trim();
      if (!reason) {
        throw badRequest('A rejection reason is required to reject an upload.');
      }
      const updated = await this.uploads.update(uuid, {
        status: 'rejected',
        rejectionReason: reason,
      });
      return toHistoryUploadDto(updated);
    }

    const exists = await this.storage.exists(row.objectKey);
    if (!exists) {
      throw uploadMissing(
        'The uploaded file was not found in object storage — ask the owner to upload it again.',
      );
    }
    const updated = await this.uploads.update(uuid, { status: 'finalised' });

    this.events.publish(
      new HistoryUploadReceived({
        historyUploadId: PrefixedId.format('historyUpload', row.id),
        sourceType: row.intakeSubmissionId
          ? 'intake_submission'
          : row.appointmentRequestId
            ? 'appointment_request'
            : null,
        sourceId: row.intakeSubmissionId ?? row.appointmentRequestId,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        fileName: row.originalFilename,
      }),
    );

    return toHistoryUploadDto(updated);
  }
}
