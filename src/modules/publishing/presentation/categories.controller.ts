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
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public, Requires } from '../../../shared/cross-cutting/decorators';
import { CreateCategoryCommand } from '../application/commands/create-category.command';
import { UpdateCategoryCommand } from '../application/commands/update-category.command';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from '../application/dto/publishing.requests.dto';
import { CategoryDto } from '../application/dto/publishing.responses.dto';
import { PublishingFacadePort } from '../application/facades/publishing-facade-port';
import { ListCategoriesQuery } from '../application/queries/list-categories.query';

@Controller('categories')
@ApiTags('Publishing')
export class CategoriesController {
  constructor(private readonly publishing: PublishingFacadePort) {}

  @Get()
  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ operationId: 'listCategories', summary: 'List categories' })
  @ApiOkResponse({ description: 'Categories in display order.' })
  list(): Promise<CategoryDto[]> {
    return this.publishing.listCategories(new ListCategoriesQuery());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @Requires({ permissions: ['content:write'] })
  @ApiOperation({
    operationId: 'createCategory',
    summary: 'Create category (staff)',
  })
  @ApiCreatedResponse({ description: 'Created.' })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED — duplicate slug.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing content:write.' })
  create(@Body() body: CreateCategoryDto): Promise<CategoryDto> {
    return this.publishing.createCategory(new CreateCategoryCommand(body));
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @Requires({ permissions: ['content:write'] })
  @ApiOperation({
    operationId: 'updateCategory',
    summary: 'Edit category (staff)',
  })
  @ApiOkResponse({ description: 'Updated.' })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED — duplicate slug.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing content:write.' })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown category.',
  })
  update(
    @Param('id') id: string,
    @Body() body: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.publishing.updateCategory(new UpdateCategoryCommand(id, body));
  }
}
