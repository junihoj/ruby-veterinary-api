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
} from '@nestjs/swagger';
import { toLimit } from '../../../shared/cross-cutting/pagination';
import { Requires } from '../../../shared/cross-cutting/decorators';
import { TriageAppointmentRequestCommand } from '../application/commands/triage-appointment-request.command';
import { TriageAppointmentRequestDto } from '../application/dto/care.requests.dto';
import { AppointmentRequestDto } from '../application/dto/care.responses.dto';
import { CareCoordinationFacadePort } from '../application/facades/care-coordination-facade-port';
import { ListAppointmentRequestsQuery } from '../application/queries/list-appointment-requests.query';

/** Staff triage queue (intake.yaml admin appointment requests) — care:write. */
@Controller('admin/appointment-requests')
@ApiTags('Intake')
@ApiBearerAuth()
@Requires({ permissions: ['care:write'] })
export class AdminAppointmentRequestsController {
  constructor(private readonly care: CareCoordinationFacadePort) {}

  @Get()
  @ApiOperation({
    operationId: 'listAppointmentRequests',
    summary: 'Staff queue of appointment requests',
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
    description: 'apt_… page cursor',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  async listAppointmentRequests(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{
    data: AppointmentRequestDto[];
    meta: {
      pagination: { limit: number; cursor: string | null; hasMore: boolean };
    };
  }> {
    const pageLimit = toLimit(limit);
    const result = await this.care.listAppointmentRequests(
      new ListAppointmentRequestsQuery(status ?? null, pageLimit, cursor),
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
    operationId: 'triageAppointmentRequest',
    summary: 'Triage an appointment request',
  })
  @ApiOkResponse({ description: 'Updated request.' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown request.',
  })
  @ApiConflictResponse({
    description: 'STATE_CONFLICT — invalid status transition.',
  })
  triageAppointmentRequest(
    @Param('id') id: string,
    @Body() body: TriageAppointmentRequestDto,
  ): Promise<AppointmentRequestDto> {
    return this.care.triageAppointmentRequest(
      new TriageAppointmentRequestCommand(id, body),
    );
  }
}
