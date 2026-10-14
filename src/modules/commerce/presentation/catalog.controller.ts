import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { toLimit } from '../../../shared/cross-cutting/pagination';
import { Public } from '../../../shared/cross-cutting/decorators';
import { CommerceFacadePort } from '../application/facades/commerce-facade-port';
import {
  ProductDetailDto,
  ProductSummaryDto,
} from '../application/dto/commerce.responses.dto';
import { GetProductQuery } from '../application/queries/get-product.query';
import {
  ListProductsQuery,
  ProductListFilters,
} from '../application/queries/list-products.query';

/**
 * Public catalog reads (commerce.yaml Catalog): no auth (ADR-0011 public
 * browsing) and CDN-cacheable — `Cache-Control: public, max-age=60`
 * (api-specification §Caching).
 */
@Controller('products')
@Public()
@ApiTags('Catalog')
export class CatalogController {
  constructor(private readonly commerce: CommerceFacadePort) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    operationId: 'listProducts',
    summary: 'Filterable product list',
  })
  @ApiOkResponse({ description: 'Product list (cursor-paginated).' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '1–100, default 20',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'prd_… page cursor',
  })
  @ApiQuery({ name: 'category', required: false, description: 'Category slug' })
  @ApiQuery({
    name: 'petType',
    required: false,
    description: 'Facet value, e.g. dog',
  })
  @ApiQuery({
    name: 'lifeStage',
    required: false,
    description: 'Facet value, e.g. adult',
  })
  @ApiQuery({
    name: 'condition',
    required: false,
    description: 'Facet value, e.g. joint_support',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Name/summary search' })
  async listProducts(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('category') category?: string,
    @Query('petType') petType?: string,
    @Query('lifeStage') lifeStage?: string,
    @Query('condition') condition?: string,
    @Query('q') q?: string,
  ): Promise<{
    data: ProductSummaryDto[];
    meta: {
      pagination: { limit: number; cursor: string | null; hasMore: boolean };
    };
  }> {
    const pageLimit = toLimit(limit);
    const filters: ProductListFilters = {
      ...(category ? { category } : {}),
      ...(petType ? { petType } : {}),
      ...(lifeStage ? { lifeStage } : {}),
      ...(condition ? { condition } : {}),
      ...(q ? { q } : {}),
    };
    const result = await this.commerce.listProducts(
      new ListProductsQuery(pageLimit, cursor, filters),
    );
    return {
      data: result.data,
      meta: {
        pagination: {
          limit: pageLimit,
          cursor: result.nextCursor,
          hasMore: result.hasMore,
        },
      },
    };
  }

  @Get(':slug')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    operationId: 'getProduct',
    summary: 'Product detail page by slug (all seven shapes)',
  })
  @ApiOkResponse({
    description:
      'PDP payload varying by product type (variants, members, slots, external link).',
  })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown slug.' })
  getProduct(@Param('slug') slug: string): Promise<ProductDetailDto> {
    return this.commerce.getProduct(new GetProductQuery(slug));
  }
}
