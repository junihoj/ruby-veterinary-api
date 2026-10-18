import { AdminCreateDownloadFileDto } from '../dto/commerce.requests.dto';

/** POST /admin/products/{id}/download-files — presigned PUT upload (M3b). */
export class AdminCreateDownloadFileCommand {
  constructor(
    public readonly productId: string,
    public readonly input: AdminCreateDownloadFileDto,
  ) {}
}
