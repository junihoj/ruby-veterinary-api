import { AdminUpdateProductDto } from '../dto/commerce.requests.dto';

/** PATCH /admin/products/{id} — partial product or variant update. */
export class AdminUpdateProductCommand {
  constructor(
    public readonly productId: string,
    public readonly input: AdminUpdateProductDto,
  ) {}
}
