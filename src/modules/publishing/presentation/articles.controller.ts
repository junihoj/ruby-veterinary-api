import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { toLimit } from '../../../shared/cross-cutting/pagination';
import {
  CurrentUser,
  Public,
  Requires,
} from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { CreateArticleCommand } from '../application/commands/create-article.command';
import { UpdateArticleCommand } from '../application/commands/update-article.command';
import { PublishArticleCommand } from '../application/commands/publish-article.command';
import {
  CreateArticleDto,
  UpdateArticleDto,
} from '../application/dto/publishing.requests.dto';
import {
  ArticleDetailDto,
  ArticleSummaryDto,
} from '../application/dto/publishing.responses.dto';
import { PublishingFacadePort } from '../application/facades/publishing-facade-port';
import { GetArticleQuery } from '../application/queries/get-article.query';
import { ListArticlesQuery } from '../application/queries/list-articles.query';

/** Public blog reads + staff article authoring (publishing.yaml M7). */
@Controller('articles')
@ApiTags('Publishing')
export class ArticlesController {
  constructor(private readonly publishing: PublishingFacadePort) {}

  @Get()
  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    operationId: 'listArticles',
    summary: 'List published articles',
  })
  @ApiOkResponse({ description: 'Published articles, newest first.' })
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
  async list(
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
    const result = await this.publishing.listArticles(
      new ListArticlesQuery(pageLimit, cursor, {
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

  @Get(':slug')
  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    operationId: 'getArticle',
    summary: 'Article detail with author, related feed, SEO metadata',
  })
  @ApiOkResponse({ description: 'Published article.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown slug.' })
  get(@Param('slug') slug: string): Promise<ArticleDetailDto> {
    return this.publishing.getArticle(new GetArticleQuery(slug));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @Requires({ permissions: ['content:write'] })
  @ApiOperation({
    operationId: 'createArticle',
    summary: 'Create article draft',
  })
  @ApiCreatedResponse({ description: 'Draft created.' })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED — unknown reference or duplicate slug.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing content:write.' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateArticleDto,
  ): Promise<ArticleDetailDto> {
    return this.publishing.createArticle(
      new CreateArticleCommand(body, user.id),
    );
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @Requires({ permissions: ['content:write'] })
  @ApiOperation({
    operationId: 'updateArticle',
    summary: 'Edit article (draft or published)',
  })
  @ApiOkResponse({ description: 'Updated article.' })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED — unknown reference or duplicate slug.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing content:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown article.' })
  update(
    @Param('id') id: string,
    @Body() body: UpdateArticleDto,
  ): Promise<ArticleDetailDto> {
    return this.publishing.updateArticle(new UpdateArticleCommand(id, body));
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @Requires({ permissions: ['content:write'] })
  @ApiOperation({
    operationId: 'publishArticle',
    summary: 'Publish article; raises ArticlePublished',
  })
  @ApiOkResponse({ description: 'Published (idempotent).' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing content:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown article.' })
  publish(@Param('id') id: string): Promise<ArticleDetailDto> {
    return this.publishing.publishArticle(new PublishArticleCommand(id));
  }
}
