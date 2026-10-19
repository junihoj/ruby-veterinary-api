import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { toLimit } from '../../../shared/cross-cutting/pagination';
import { Requires } from '../../../shared/cross-cutting/decorators';
import { UpdateHistoryUploadCommand } from '../application/commands/update-history-upload.command';
import { UpdateHistoryUploadDto } from '../application/dto/care.requests.dto';
import {
  HistoryUploadDto,
  UploadUrlDto,
} from '../application/dto/care.responses.dto';
import { CareCoordinationFacadePort } from '../application/facades/care-coordination-facade-port';
import { GetHistoryUploadUrlQuery } from '../application/queries/get-history-upload-url.query';
import { ListHistoryUploadsQuery } from '../application/queries/list-history-uploads.query';

/** Staff history-upload review (intake.yaml admin uploads) — care:write. */
@Controller('admin/uploads')
@ApiTags('Intake')
@ApiBearerAuth()
@Requires({ permissions: ['care:write'] })
export class AdminUploadsController {
  constructor(private readonly care: CareCoordinationFacadePort) {}

  @Get()
  @ApiOperation({
    operationId: 'listHistoryUploads',
    summary: 'Staff list of history uploads awaiting review',
  })
  @ApiOkResponse({ description: 'Upload page, newest first.' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'pending | finalised | rejected',
  })
  @ApiQuery({
    name: 'appointmentRequestId',
    required: false,
    description: 'apt_… filter',
  })
  @ApiQuery({
    name: 'intakeSubmissionId',
    required: false,
    description: 'int_… filter',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '1–100, default 20',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'upl_… page cursor',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  async listHistoryUploads(
    @Query('status') status?: string,
    @Query('appointmentRequestId') appointmentRequestId?: string,
    @Query('intakeSubmissionId') intakeSubmissionId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{
    data: HistoryUploadDto[];
    meta: {
      pagination: { limit: number; cursor: string | null; hasMore: boolean };
    };
  }> {
    const pageLimit = toLimit(limit);
    const result = await this.care.listHistoryUploads(
      new ListHistoryUploadsQuery(
        {
          status: status ?? null,
          appointmentRequestId: appointmentRequestId ?? null,
          intakeSubmissionId: intakeSubmissionId ?? null,
        },
        pageLimit,
        cursor,
      ),
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

  @Get(':id/url')
  @ApiOperation({
    operationId: 'getHistoryUploadUrl',
    summary: 'Issue a signed download URL for a history upload',
  })
  @ApiOkResponse({ description: 'Signed download details (short-lived).' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown upload.',
  })
  getHistoryUploadUrl(@Param('id') id: string): Promise<UploadUrlDto> {
    return this.care.getHistoryUploadUrl(new GetHistoryUploadUrlQuery(id));
  }

  @Patch(':id')
  @ApiOperation({
    operationId: 'updateHistoryUpload',
    summary: 'Finalise or reject a history upload',
  })
  @ApiOkResponse({ description: 'Updated upload.' })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED — rejection without a reason.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown upload.',
  })
  @ApiConflictResponse({
    description: 'STATE_CONFLICT — upload already finalised or rejected.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'UPLOAD_MISSING — finalise blocked, the object is absent from storage.',
  })
  updateHistoryUpload(
    @Param('id') id: string,
    @Body() body: UpdateHistoryUploadDto,
  ): Promise<HistoryUploadDto> {
    return this.care.updateHistoryUpload(
      new UpdateHistoryUploadCommand(id, body),
    );
  }
}
