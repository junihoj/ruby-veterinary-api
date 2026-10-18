import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'node:crypto';
import { ObjectStoragePort } from '../../../../shared/storage/object-storage.port';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { DownloadRepository } from '../../infrastructure/repositories/download.repository';
import { ProductRepository } from '../../infrastructure/repositories/product.repository';
import { DownloadFileUploadDto } from '../dto/commerce.responses.dto';
import { notFound } from '../errors';
import { AdminCreateDownloadFileCommand } from '../commands/admin-create-download-file.command';

/**
 * POST /admin/products/{id}/download-files (M3b, catalog:write): creates the
 * `product_download_files` row and answers with a presigned SeaweedFS PUT so
 * the staff client uploads the bytes directly (ADR-0016 — the API never
 * proxies file bodies). The object key is server-generated under the
 * product's id; unknown products are 404.
 */
@CommandHandler(AdminCreateDownloadFileCommand)
export class AdminCreateDownloadFileHandler implements ICommandHandler<AdminCreateDownloadFileCommand> {
  constructor(
    private readonly downloads: DownloadRepository,
    private readonly products: ProductRepository,
    private readonly storage: ObjectStoragePort,
  ) {}

  async execute(
    command: AdminCreateDownloadFileCommand,
  ): Promise<DownloadFileUploadDto> {
    const productId = PrefixedId.tryAnyToUuid(command.productId);
    if (!productId) throw notFound('Product not found.');
    const product = await this.products.findDetail(productId);
    if (!product) throw notFound('Product not found.');

    const objectKey = `products/${productId}/downloads/${randomUUID()}`;
    const file = await this.downloads.createDownloadFile(productId, {
      fileName: command.input.fileName,
      objectKey,
      fileSizeBytes: command.input.fileSizeBytes,
      mimeType: command.input.mimeType,
    });

    const { url, expiresIn } = await this.storage.presignUpload(
      objectKey,
      command.input.mimeType,
    );
    return {
      id: PrefixedId.format('downloadFile', file.id),
      productId: PrefixedId.format('product', productId),
      fileName: file.fileName,
      objectKey: file.objectKey,
      fileSizeBytes: file.fileSizeBytes,
      mimeType: file.mimeType,
      uploadUrl: url,
      uploadExpiresIn: expiresIn,
    };
  }
}
