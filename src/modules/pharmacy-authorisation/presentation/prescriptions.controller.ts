import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
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
import type { Request } from 'express';
import { toLimit } from '../../../shared/cross-cutting/pagination';
import {
  CurrentUser,
  Requires,
} from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { Idempotent } from '../../../shared/idempotency/idempotency.decorator';
import { IdempotencyInterceptor } from '../../../shared/idempotency/idempotency.interceptor';
import { ApprovePrescriptionCommand } from '../application/commands/approve-prescription.command';
import { QueryPrescriptionCommand } from '../application/commands/query-prescription.command';
import { RejectPrescriptionCommand } from '../application/commands/reject-prescription.command';
import {
  ApprovePrescriptionDto,
  PrescriptionReasonDto,
} from '../application/dto/pharmacy.requests.dto';
import {
  PrescriptionQueueItemDto,
  PrescriptionRequestDto,
  PrescriptionRequestDetailDto,
} from '../application/dto/pharmacy.responses.dto';
import { PharmacyFacadePort } from '../application/facades/pharmacy-facade-port';
import { GetPrescriptionRequestQuery } from '../application/queries/get-prescription-request.query';
import { ListPrescriptionQueueQuery } from '../application/queries/list-prescription-queue.query';

/** Express request carrying the RequestIdMiddleware correlation header. */
type RequestWithId = Request & { requestId?: string };

/**
 * Staff prescription review surface (pharmacy.yaml). Class-wide `rx:review`
 * gates the whole controller (queue readers); decision handlers additionally
 * require the veterinarian role — a practice_manager holding `rx:review`
 * reads the queue but gets 403 PRESCRIBER_REQUIRED on approve/reject/query.
 */
@ApiTags('Pharmacy')
@ApiBearerAuth()
@Requires({ permissions: ['rx:review'] })
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly pharmacy: PharmacyFacadePort) {}

  @Get('queue')
  @ApiOperation({
    operationId: 'listPrescriptionQueue',
    summary: 'Review queue (staff rx:review)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'queried'],
    description: 'Unfiltered returns both open states.',
  })
  @ApiOkResponse({ description: 'Queue.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing rx:review.' })
  async listQueue(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{
    data: PrescriptionQueueItemDto[];
    meta: {
      pagination: { limit: number; cursor: string | null; hasMore: boolean };
    };
  }> {
    const pageLimit = toLimit(limit);
    const filtered =
      status === 'pending' || status === 'queried' ? status : null;
    const result = await this.pharmacy.listQueue(
      new ListPrescriptionQueueQuery(filtered, pageLimit, cursor ?? null),
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
  @ApiOperation({
    operationId: 'getPrescriptionRequest',
    summary: 'Request with patient history and prescriber context',
  })
  @ApiOkResponse({ description: 'Prescription request with decisions.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing rx:review.' })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown request.',
  })
  getRequest(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithId,
  ): Promise<PrescriptionRequestDetailDto> {
    return this.pharmacy.getRequest(
      new GetPrescriptionRequestQuery(id, user.id, req.requestId ?? null),
    );
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent('rx-approve')
  @ApiOperation({
    operationId: 'approvePrescription',
    summary: 'Approve; raises PrescriptionApproved, writes audit row',
  })
  @ApiOkResponse({ description: 'Approved.' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({
    description: 'PRESCRIBER_REQUIRED — decisions are veterinarian-only.',
  })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown request.',
  })
  @ApiConflictResponse({
    description:
      'STATE_CONFLICT — already decided; or IDEMPOTENCY_CONFLICT on a replayed key with a different body.',
  })
  approve(
    @Param('id') id: string,
    @Body() body: ApprovePrescriptionDto,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithId,
  ): Promise<PrescriptionRequestDto> {
    return this.pharmacy.approve(
      new ApprovePrescriptionCommand(
        id,
        { id: user.id, roles: user.roles },
        body?.note ?? null,
        req.requestId ?? null,
      ),
    );
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent('rx-reject')
  @ApiOperation({
    operationId: 'rejectPrescription',
    summary: 'Reject with reason',
  })
  @ApiOkResponse({ description: 'Rejected.' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({
    description: 'PRESCRIBER_REQUIRED — decisions are veterinarian-only.',
  })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown request.',
  })
  @ApiConflictResponse({
    description:
      'STATE_CONFLICT — already decided; or IDEMPOTENCY_CONFLICT on a replayed key with a different body.',
  })
  reject(
    @Param('id') id: string,
    @Body() body: PrescriptionReasonDto,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithId,
  ): Promise<PrescriptionRequestDto> {
    return this.pharmacy.reject(
      new RejectPrescriptionCommand(
        id,
        { id: user.id, roles: user.roles },
        body.reasonCode ?? null,
        body.reasonText,
        req.requestId ?? null,
      ),
    );
  }

  @Post(':id/query')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @Idempotent('rx-query')
  @ApiOperation({
    operationId: 'queryPrescription',
    summary: 'Request more information',
  })
  @ApiOkResponse({ description: 'Queried.' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({
    description: 'PRESCRIBER_REQUIRED — decisions are veterinarian-only.',
  })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown request.',
  })
  @ApiConflictResponse({
    description:
      'STATE_CONFLICT — already decided or already queried; or IDEMPOTENCY_CONFLICT on a replayed key with a different body.',
  })
  queryPrescription(
    @Param('id') id: string,
    @Body() body: PrescriptionReasonDto,
    @CurrentUser() user: AuthUser,
    @Req() req: RequestWithId,
  ): Promise<PrescriptionRequestDto> {
    return this.pharmacy.query(
      new QueryPrescriptionCommand(
        id,
        { id: user.id, roles: user.roles },
        body.reasonCode ?? null,
        body.reasonText,
        req.requestId ?? null,
      ),
    );
  }
}
