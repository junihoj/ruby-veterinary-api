import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { toLimit } from '../../../shared/cross-cutting/pagination';
import { Requires } from '../../../shared/cross-cutting/decorators';
import {
  ArticleDetailDto,
  ArticleSummaryDto,
} from '../application/dto/publishing.responses.dto';
import { PublishingFacadePort } from '../application/facades/publishing-facade-port';
import { GetAdminArticleQuery } from '../application/queries/get-admin-article.query';
import { ListAdminArticlesQuery } from '../application/queries/list-admin-articles.query';

/** Staff draft reads (publishing.yaml M7) — content:write. */
@Controller('admin/articles')
@ApiTags('Publishing')
@ApiBearerAuth()
@Requires({ permissions: ['content:write'] })
export class AdminArticlesController {
  constructor(private readonly publishing: PublishingFacadePort) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminArticles',
    summary: 'Staff list of articles across every status',
  })
  @ApiOkResponse({ description: 'Article page, most recently updated first.' })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED — unknown status or cursor.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'draft | published | archived',
  })
  @ApiQuery({ name: 'q', required: false, description: 'Title/slug search' })
  @ApiQuery({ name: 'category', required: false, description: 'Category slug' })
  @ApiQuery({ name: 'tag', required: false, description: 'Tag slug' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '1–100, default 20',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'art_… page cursor',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing content:write.' })
  async list(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{
    data: ArticleSummaryDto[];
    meta: {
      pagination: { limit: number; cursor: string | null; hasMore: boolean };
    };
  }> {
    const pageLimit = toLimit(limit);
    const result = await this.publishing.listAdminArticles(
      new ListAdminArticlesQuery(pageLimit, cursor, {
        ...(status ? { status } : {}),
        ...(q ? { q } : {}),
        ...(category ? { category } : {}),
        ...(tag ? { tag } : {}),
      }),
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

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getAdminArticle',
    summary: 'Staff article detail including drafts and archives',
  })
  @ApiOkResponse({ description: 'Article.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing content:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown article.' })
  get(@Param('id') id: string): Promise<ArticleDetailDto> {
    return this.publishing.getAdminArticle(new GetAdminArticleQuery(id));
  }
}
