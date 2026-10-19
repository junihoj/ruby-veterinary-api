import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ObjectStoragePort } from '../../../../shared/storage/object-storage.port';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { GetHistoryUploadUrlQuery } from '../queries/get-history-upload-url.query';
import { UploadUrlDto } from '../dto/care.responses.dto';
import { notFound } from '../errors';
import { HistoryUploadRepository } from '../../infrastructure/repositories/history-upload.repository';

/**
 * GET /admin/uploads/{id}/url — files are private in SeaweedFS; staff reach
 * them only through short-lived signed URLs (ADR-0016).
 */
@QueryHandler(GetHistoryUploadUrlQuery)
export class GetHistoryUploadUrlHandler implements IQueryHandler<GetHistoryUploadUrlQuery> {
  constructor(
    private readonly uploads: HistoryUploadRepository,
    private readonly storage: ObjectStoragePort,
  ) {}

  async execute(query: GetHistoryUploadUrlQuery): Promise<UploadUrlDto> {
    const uuid = PrefixedId.tryAnyToUuid(query.id);
    if (uuid === null) throw notFound('History upload not found.');
    const row = await this.uploads.findById(uuid);
    if (!row) throw notFound('History upload not found.');

    const { url, expiresIn } = await this.storage.presignDownload(
      row.objectKey,
    );
    return {
      url,
      expiresIn,
      ...(row.originalFilename ? { fileName: row.originalFilename } : {}),
      mimeType: row.mimeType,
      byteSize: row.byteSize,
    };
  }
}
