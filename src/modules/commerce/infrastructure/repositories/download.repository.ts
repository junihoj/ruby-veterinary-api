import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/**
 * Download entitlement reads/writes (commerce.md product_download_grants +
 * product_download_files, M3b). Grant issuance lives in the payment capture
 * path; this repository owns serving: listing what an order granted, and
 * atomically consuming one download when a signed URL is issued.
 */
@Injectable()
export class DownloadRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grants on an owned order, expanded to file-level entries (the grant
   * covers the product; each file it hosts is one row in the result).
   */
  async listByOrder(orderId: string) {
    return this.prisma.productDownloadGrant.findMany({
      where: { orderItem: { orderId } },
      include: {
        product: {
          select: {
            name: true,
            downloadFiles: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Owner check for download reads: null when unknown or foreign. */
  async findOwnedOrder(orderId: string, userId: string) {
    return this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true },
    });
  }

  /** Admin file record (M3b): null when the product is unknown. */
  async createDownloadFile(
    productId: string,
    data: {
      fileName: string;
      objectKey: string;
      fileSizeBytes: number;
      mimeType: string;
    },
  ) {
    return this.prisma.productDownloadFile.create({
      data: { productId, ...data },
    });
  }

  /** Grant with its owning user (404 on foreign) and the product's files. */
  async findGrantForUser(grantId: string, userId: string) {
    return this.prisma.productDownloadGrant.findFirst({
      where: { id: grantId, orderItem: { order: { userId } } },
      include: {
        product: {
          select: { downloadFiles: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
  }

  /**
   * Consume one download atomically (M3b: `downloads_used` never exceeds
   * `max_downloads` under concurrency — the guard lives in the WHERE).
   * Returns the updated row, or null when the grant was not servable
   * (revoked, expired, or exhausted).
   */
  async consumeOne(grantId: string) {
    const consumed = await this.prisma.$executeRaw`
      UPDATE commerce.product_download_grants
         SET downloads_used = downloads_used + 1,
             last_download_at = now()
       WHERE id = ${grantId}::uuid
         AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > now())
         AND (max_downloads IS NULL OR downloads_used < max_downloads)`;
    if (consumed === 0) return null;
    return this.prisma.productDownloadGrant.findUnique({
      where: { id: grantId },
    });
  }
}
