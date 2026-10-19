import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'node:crypto';
import { ObjectStoragePort } from '../../../../shared/storage/object-storage.port';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { SignUploadCommand } from '../commands/sign-upload.command';
import { SignUploadResultDto } from '../dto/care.responses.dto';
import { uploadTooLarge } from '../errors';
import { HistoryUploadRepository } from '../../infrastructure/repositories/history-upload.repository';

const MAX_UPLOAD_BYTES = 10_485_760; // 10 MB (intake.yaml Size cap)

/**
 * POST /uploads/sign (ADR-0016): presigns a direct-to-SeaweedFS PUT — the API
 * never sees file bytes. `medical_history` records the pending `upl_…` row
 * whose id the owner later references from `historyUploadIds`; `cms_media`
 * presigns without a row (reserved for publishing media, uploadId null).
 * The 10 MB cap is enforced here as 413 UPLOAD_TOO_LARGE (contract).
 */
@CommandHandler(SignUploadCommand)
export class SignUploadHandler implements ICommandHandler<SignUploadCommand> {
  constructor(
    private readonly uploads: HistoryUploadRepository,
    private readonly storage: ObjectStoragePort,
  ) {}

  async execute(command: SignUploadCommand): Promise<SignUploadResultDto> {
    if (command.input.byteSize > MAX_UPLOAD_BYTES) {
      throw uploadTooLarge('Uploads are capped at 10 MB.');
    }

    const prefix =
      command.input.purpose === 'medical_history' ? 'history' : 'cms';
    const objectKey = `uploads/${prefix}/${randomUUID()}`;

    let uploadId: string | null = null;
    if (command.input.purpose === 'medical_history') {
      const row = await this.uploads.create({
        objectKey,
        originalFilename: command.input.filename,
        mimeType: command.input.mimeType,
        byteSize: command.input.byteSize,
        uploadedByUserId: command.userId,
      });
      uploadId = PrefixedId.format('historyUpload', row.id);
    }

    const { url, expiresIn } = await this.storage.presignUpload(
      objectKey,
      command.input.mimeType,
    );

    return {
      uploadId,
      objectKey,
      uploadUrl: url,
      method: 'PUT',
      headers: { 'Content-Type': command.input.mimeType },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }
}
