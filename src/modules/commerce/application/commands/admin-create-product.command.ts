import { AdminCreateProductDto } from '../dto/commerce.requests.dto';

/** POST /admin/products — create a draft product (catalog:write). */
export class AdminCreateProductCommand {
  constructor(public readonly input: AdminCreateProductDto) {}
}
