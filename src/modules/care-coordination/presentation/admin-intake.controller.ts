import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { AcceptIntakeSubmissionCommand } from '../application/commands/accept-intake-submission.command';
import { UpdateIntakeSubmissionCommand } from '../application/commands/update-intake-submission.command';
import {
  AcceptIntakeSubmissionDto,
  UpdateIntakeSubmissionDto,
} from '../application/dto/care.requests.dto';
import {
  AcceptIntakeResultDto,
  IntakeSubmissionDto,
} from '../application/dto/care.responses.dto';
import { CareCoordinationFacadePort } from '../application/facades/care-coordination-facade-port';
import { ListIntakeSubmissionsQuery } from '../application/queries/list-intake-submissions.query';

/**
 * Staff intake queue, review, and acceptance (intake.yaml) — care:write.
 * Acceptance files the Client + Pets through the Client & Patient Records
 * module (Flow 2), so this controller never touches the clients schema.
 */
@Controller('admin/clients/intake')
@ApiTags('Intake')
@ApiBearerAuth()
@Requires({ permissions: ['care:write'] })
export class AdminIntakeController {
  constructor(private readonly care: CareCoordinationFacadePort) {}

  @Get()
  @ApiOperation({
    operationId: 'listIntakeSubmissions',
    summary: 'Staff queue of new-client intake submissions',
  })
  @ApiOkResponse({ description: 'Queue page, newest first.' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Lifecycle filter',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '1–100, default 20',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'int_… page cursor',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  async listIntakeSubmissions(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{
    data: IntakeSubmissionDto[];
    meta: {
      pagination: { limit: number; cursor: string | null; hasMore: boolean };
    };
  }> {
    const pageLimit = toLimit(limit);
    const result = await this.care.listIntakeSubmissions(
      new ListIntakeSubmissionsQuery(status ?? null, pageLimit, cursor),
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

  @Patch(':id')
  @ApiOperation({
    operationId: 'updateIntakeSubmission',
    summary: 'Move an intake submission into review or reject it',
  })
  @ApiOkResponse({ description: 'Updated submission.' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown submission.',
  })
  @ApiConflictResponse({
    description: 'STATE_CONFLICT — invalid status transition.',
  })
  updateIntakeSubmission(
    @Param('id') id: string,
    @Body() body: UpdateIntakeSubmissionDto,
  ): Promise<IntakeSubmissionDto> {
    return this.care.updateIntakeSubmission(
      new UpdateIntakeSubmissionCommand(id, body),
    );
  }

  @Post(':id/accept')
  @ApiOperation({
    operationId: 'acceptIntakeSubmission',
    summary: 'Accept an intake — files the client and their pets',
  })
  @ApiCreatedResponse({
    description: 'Accepted; client and pets filed (clientId + pet summaries).',
  })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown submission or client.',
  })
  @ApiConflictResponse({
    description:
      'STATE_CONFLICT (terminal or concurrent accept) or ALREADY_LINKED (account already has a client).',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'INTAKE_NOT_ACCEPTABLE — existingClient submission without a clientId.',
  })
  acceptIntakeSubmission(
    @Param('id') id: string,
    @Body() body: AcceptIntakeSubmissionDto,
  ): Promise<AcceptIntakeResultDto> {
    return this.care.acceptIntakeSubmission(
      new AcceptIntakeSubmissionCommand(id, body),
    );
  }
}
