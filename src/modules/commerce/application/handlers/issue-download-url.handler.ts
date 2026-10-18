import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ObjectStoragePort } from '../../../../shared/storage/object-storage.port';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { DownloadRepository } from '../../infrastructure/repositories/download.repository';
import { DownloadUrlDto } from '../dto/commerce.responses.dto';
import { downloadNotAvailable, notFound } from '../errors';
import { IssueDownloadUrlCommand } from '../commands/issue-download-url.command';

/**
 * POST /downloads/{grantId}/url (M3b, ADR-0016): consumes one download from
 * the grant and answers with a short-lived SeaweedFS signed GET URL for the
 * product's first file (by sortOrder).
 *
 * 404 — unknown or foreign grant (no existence leaks).
 * 403 DOWNLOAD_NOT_AVAILABLE — grant revoked, expired, or exhausted; also a
 * granted product whose files were all removed (nothing left to serve).
 */
@CommandHandler(IssueDownloadUrlCommand)
export class IssueDownloadUrlHandler implements ICommandHandler<IssueDownloadUrlCommand> {
  constructor(
    private readonly downloads: DownloadRepository,
    private readonly storage: ObjectStoragePort,
  ) {}

  async execute(command: IssueDownloadUrlCommand): Promise<DownloadUrlDto> {
    const grantId = PrefixedId.tryAnyToUuid(command.grantId);
    if (!grantId) throw notFound('Download grant not found.');

    const grant = await this.downloads.findGrantForUser(
      grantId,
      command.userId,
    );
    if (!grant) throw notFound('Download grant not found.');

    const file = grant.product.downloadFiles[0];
    if (
      !file ||
      grant.revokedAt !== null ||
      (grant.expiresAt !== null && grant.expiresAt.getTime() <= Date.now()) ||
      (grant.maxDownloads !== null && grant.downloadsUsed >= grant.maxDownloads)
    ) {
      throw downloadNotAvailable(
        'This download is no longer available. Please contact the clinic if you need help.',
      );
    }

    // Atomic guard: a concurrent burst can exhaust the allowance between the
    // read above and here; only one caller wins each remaining download.
    const consumed = await this.downloads.consumeOne(grantId);
    if (!consumed) {
      throw downloadNotAvailable(
        'This download is no longer available. Please contact the clinic if you need help.',
      );
    }

    const { url, expiresIn } = await this.storage.presignDownload(
      file.objectKey,
    );
    return {
      grantId: PrefixedId.format('downloadGrant', grant.id),
      fileName: file.fileName,
      url,
      expiresIn,
    };
  }
}
