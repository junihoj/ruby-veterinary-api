import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { DownloadRepository } from '../../infrastructure/repositories/download.repository';
import { DownloadFileGrantDto } from '../dto/commerce.responses.dto';
import { notFound } from '../errors';
import { ListOrderDownloadsQuery } from '../queries/list-order-downloads.query';

/**
 * GET /orders/{id}/downloads (M3b): one entry per granted file. The grant
 * covers the product — every file the product hosts is listed under it; a
 * product with no files yields no entries. Unknown or foreign orders are
 * 404 (no existence leaks).
 */
@QueryHandler(ListOrderDownloadsQuery)
export class ListOrderDownloadsHandler implements IQueryHandler<ListOrderDownloadsQuery> {
  constructor(private readonly downloads: DownloadRepository) {}

  async execute(
    query: ListOrderDownloadsQuery,
  ): Promise<DownloadFileGrantDto[]> {
    const orderId = PrefixedId.tryAnyToUuid(query.orderId);
    if (!orderId) throw notFound('Order not found.');

    // Owner-scoped: someone else's order is indistinguishable from a
    // missing one (404, never 403 — no existence leaks). An owned order
    // with no grants answers an empty list.
    const order = await this.downloads.findOwnedOrder(orderId, query.userId);
    if (!order) throw notFound('Order not found.');

    const grants = await this.downloads.listByOrder(orderId);
    return grants.flatMap((grant) =>
      grant.product.downloadFiles.map((file) => ({
        grantId: PrefixedId.format('downloadGrant', grant.id),
        fileName: file.fileName,
        fileSizeBytes: file.fileSizeBytes,
        mimeType: file.mimeType,
        downloadsUsed: grant.downloadsUsed,
        maxDownloads: grant.maxDownloads,
        remainingDownloads:
          grant.maxDownloads === null
            ? null
            : Math.max(grant.maxDownloads - grant.downloadsUsed, 0),
        expiresAt: grant.expiresAt ? grant.expiresAt.toISOString() : null,
        revoked: grant.revokedAt !== null,
      })),
    );
  }
}
