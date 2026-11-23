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
import { CreateTagCommand } from '../application/commands/create-tag.command';
import { UpdateTagCommand } from '../application/commands/update-tag.command';
import {
  CreateTagDto,
  UpdateTagDto,
} from '../application/dto/publishing.requests.dto';
import { TagDto } from '../application/dto/publishing.responses.dto';
import { PublishingFacadePort } from '../application/facades/publishing-facade-port';
import { ListTagsQuery } from '../application/queries/list-tags.query';

@Controller('tags')
@ApiTags('Publishing')
export class TagsController {
  constructor(private readonly publishing: PublishingFacadePort) {}

  @Get()
  @Public()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ operationId: 'listTags', summary: 'List tags' })
  @ApiOkResponse({ description: 'Tags in name order.' })
  list(): Promise<TagDto[]> {
    return this.publishing.listTags(new ListTagsQuery());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @Requires({ permissions: ['content:write'] })
  @ApiOperation({ operationId: 'createTag', summary: 'Create tag (staff)' })
  @ApiCreatedResponse({ description: 'Created.' })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED — duplicate slug.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing content:write.' })
  create(@Body() body: CreateTagDto): Promise<TagDto> {
    return this.publishing.createTag(new CreateTagCommand(body));
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @Requires({ permissions: ['content:write'] })
  @ApiOperation({ operationId: 'updateTag', summary: 'Edit tag (staff)' })
  @ApiOkResponse({ description: 'Updated.' })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED — duplicate slug.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing content:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown tag.' })
  update(@Param('id') id: string, @Body() body: UpdateTagDto): Promise<TagDto> {
    return this.publishing.updateTag(new UpdateTagCommand(id, body));
  }
}
