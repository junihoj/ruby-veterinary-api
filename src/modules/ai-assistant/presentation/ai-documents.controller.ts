import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Requires } from '../../../shared/cross-cutting/decorators';
import { validationFailed } from '../application/errors';
import {
  AiAssistantPort,
  type DocumentCategory,
  type DocumentSummaryDto,
} from '../application/ports/ai-assistant-port';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_STATUSES,
  UpdateDocumentBodyDto,
} from './ai-documents.dto';

interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

interface IngestMetadata {
  title: string;
  category: DocumentCategory;
  source: string | null;
  effectiveDate: string | null;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@ApiTags('Admin AI Documents')
@ApiBearerAuth()
@Controller('admin/ai/documents')
@Requires({ permissions: ['ai:admin'] })
export class AiDocumentsController {
  constructor(@Inject(AiAssistantPort) private readonly ai: AiAssistantPort) {}

  @Get()
  @ApiOperation({ operationId: 'listDocuments', summary: 'List documents' })
  @ApiQuery({ name: 'status', required: false, enum: DOCUMENT_STATUSES })
  @ApiQuery({ name: 'category', required: false, enum: DOCUMENT_CATEGORIES })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ description: 'Paginated document list' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async list(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    if (status && !DOCUMENT_STATUSES.includes(status as never)) {
      throw validationFailed('Unknown document status filter.');
    }
    if (category && !DOCUMENT_CATEGORIES.includes(category as never)) {
      throw validationFailed('Unknown document category filter.');
    }
    const parsedLimit = limit ? Number(limit) : 20;
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
      throw validationFailed('limit must be a positive integer.');
    }
    return this.ai.listDocuments({
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      limit: Math.min(parsedLimit, 100),
      cursor: cursor ?? null,
    });
  }

  @Post()
  @ApiOperation({
    operationId: 'ingestDocument',
    summary: 'Ingest a knowledge-base document',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'metadata'],
      properties: {
        file: { type: 'string', format: 'binary' },
        metadata: { type: 'string', description: 'JSON string' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Document created (pending_review)' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiConflictResponse({
    description: 'Duplicate content hash; version bumped',
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  async ingest(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body('metadata') metadata?: string,
  ): Promise<DocumentSummaryDto> {
    if (!file?.buffer?.length) {
      throw validationFailed('A file part is required.');
    }
    const parsed = this.parseMetadata(metadata);
    return this.ai.ingest({
      title: parsed.title,
      category: parsed.category,
      source: parsed.source,
      effectiveDate: parsed.effectiveDate,
      content: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
    });
  }

  @Get(':documentId')
  @ApiOperation({ operationId: 'getDocument', summary: 'Get a document' })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiOkResponse({ description: 'Document with findings' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async get(
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
  ): Promise<DocumentSummaryDto> {
    return this.ai.getDocument(documentId);
  }

  @Put(':documentId')
  @ApiOperation({
    operationId: 'updateDocument',
    summary: 'Update document metadata',
  })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiOkResponse({ description: 'Updated document' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async update(
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
    @Body() body: UpdateDocumentBodyDto,
  ): Promise<DocumentSummaryDto> {
    return this.ai.updateDocument(documentId, {
      ...(body.title ? { title: body.title } : {}),
      ...(body.category ? { category: body.category } : {}),
      ...(body.effective_date ? { effectiveDate: body.effective_date } : {}),
    });
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'deleteDocument',
    summary: 'Delete a document (cascade)',
  })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Document deleted' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async remove(
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
  ): Promise<void> {
    await this.ai.deleteDocument(documentId);
  }

  @Post(':documentId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'approveDocument',
    summary: 'Approve a pending document',
  })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiOkResponse({ description: 'Document is now active' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  @ApiConflictResponse({ description: 'Document is not pending_review' })
  async approve(
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
  ): Promise<DocumentSummaryDto> {
    return this.ai.approveDocument(documentId);
  }

  @Post(':documentId/reindex')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    operationId: 'reindexDocument',
    summary: 'Re-chunk and re-embed a document',
  })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiAcceptedResponse({ description: 'Reindex job queued' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async reindex(
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
  ): Promise<DocumentSummaryDto> {
    return this.ai.reindexDocument(documentId);
  }

  @Post(':documentId/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'archiveDocument',
    summary: 'Archive a document',
  })
  @ApiParam({ name: 'documentId', format: 'uuid' })
  @ApiOkResponse({ description: 'Document archived' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  async archive(
    @Param('documentId', new ParseUUIDPipe({ version: '4' }))
    documentId: string,
  ): Promise<DocumentSummaryDto> {
    return this.ai.archiveDocument(documentId);
  }

  private parseMetadata(raw: string | undefined): IngestMetadata {
    if (!raw) {
      throw validationFailed('The metadata part is required.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw validationFailed('metadata must be valid JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw validationFailed('metadata must be a JSON object.');
    }
    const value = parsed as Record<string, unknown>;
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    if (!title) {
      throw validationFailed('metadata.title is required.');
    }
    const category = value.category;
    if (
      typeof category !== 'string' ||
      !DOCUMENT_CATEGORIES.includes(category as never)
    ) {
      throw validationFailed(
        'metadata.category must be one of: policy, services, hours, pricing, catalog, faq, other.',
      );
    }
    const effectiveRaw = value.effectiveDate ?? value.effective_date;
    if (
      effectiveRaw !== undefined &&
      effectiveRaw !== null &&
      (typeof effectiveRaw !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(effectiveRaw))
    ) {
      throw validationFailed('metadata.effectiveDate must be YYYY-MM-DD.');
    }
    const source =
      typeof value.source === 'string' && value.source.trim()
        ? value.source.trim()
        : null;
    return {
      title,
      category: category as DocumentCategory,
      source,
      effectiveDate: typeof effectiveRaw === 'string' ? effectiveRaw : null,
    };
  }
}
