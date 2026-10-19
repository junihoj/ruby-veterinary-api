import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'node:crypto';
import { ObjectStoragePort } from '../../../../shared/storage/object-storage.port';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { CreateMedicalHistoryRecordCommand } from '../commands/create-medical-history-record.command';
import { toMedicalHistoryRecordDto } from '../dto/client-records.mapper';
import {
  MedicalHistoryRecordDto,
  MedicalHistoryRecordUploadDto,
} from '../dto/client-records.responses.dto';
import { notFound, uploadTooLarge } from '../errors';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';

const MAX_UPLOAD_BYTES = 10_485_760; // 10 MB (client-records.yaml byteSize cap)

/**
 * POST /admin/pets/{id}/medical-history — creates the reference record and
 * answers with a presigned PUT so the staff client uploads the bytes
 * straight to SeaweedFS (ADR-0016; the admin download-file precedent). The
 * server-generated objectKey is the only accepted upload target. The 10 MB
 * cap lands here as 413 (contract).
 */
@CommandHandler(CreateMedicalHistoryRecordCommand)
export class CreateMedicalHistoryRecordHandler implements ICommandHandler<CreateMedicalHistoryRecordCommand> {
  constructor(
    private readonly pets: PetRepository,
    private readonly storage: ObjectStoragePort,
  ) {}

  async execute(
    command: CreateMedicalHistoryRecordCommand,
  ): Promise<MedicalHistoryRecordUploadDto> {
    if (command.input.byteSize > MAX_UPLOAD_BYTES) {
      throw uploadTooLarge('Medical history uploads are capped at 10 MB.');
    }

    const petUuid = PrefixedId.tryAnyToUuid(command.petId);
    if (petUuid === null) throw notFound('Pet not found.');
    const pet = await this.pets.findById(petUuid);
    if (!pet) throw notFound('Pet not found.');

    const objectKey = `pets/${pet.id}/history/${randomUUID()}`;
    const row = await this.pets.createHistory(pet.id, {
      title: command.input.title,
      objectKey,
      mimeType: command.input.mimeType,
      byteSize: command.input.byteSize,
      source: 'staff_upload',
      uploadedByUserId: command.uploadedByUserId,
      visitDate: command.input.visitDate
        ? new Date(command.input.visitDate)
        : null,
      summary: command.input.summary ?? null,
    });

    const { url, expiresIn } = await this.storage.presignUpload(
      objectKey,
      command.input.mimeType,
    );
    const record: MedicalHistoryRecordDto = toMedicalHistoryRecordDto(row);
    return {
      ...record,
      objectKey,
      uploadUrl: url,
      uploadExpiresIn: expiresIn,
    };
  }
}
