import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ProductRepository } from '../../infrastructure/repositories/product.repository';
import { toProductDetail } from '../dto/commerce.mapper';
import { ProductDetailDto } from '../dto/commerce.responses.dto';
import { notFound } from '../errors';
import { GetProductQuery } from '../queries/get-product.query';

@QueryHandler(GetProductQuery)
export class GetProductHandler implements IQueryHandler<GetProductQuery> {
  constructor(private readonly products: ProductRepository) {}

  async execute(query: GetProductQuery): Promise<ProductDetailDto> {
    const row = await this.products.findPublishedBySlug(query.slug);
    if (!row) throw notFound('Product not found.');
    return toProductDetail(row);
  }
}
