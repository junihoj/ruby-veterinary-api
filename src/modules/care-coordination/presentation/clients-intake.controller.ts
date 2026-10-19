import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  OptionalAuth,
} from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { IdempotencyInterceptor } from '../../../shared/idempotency/idempotency.interceptor';
import { Idempotent } from '../../../shared/idempotency/idempotency.decorator';
import { CreateIntakeSubmissionCommand } from '../application/commands/create-intake-submission.command';
import { IntakeSubmissionCreateDto } from '../application/dto/care.requests.dto';
import {
  CreateIntakeSubmissionResultDto,
  IntakeStatusDto,
} from '../application/dto/care.responses.dto';
import { CareCoordinationFacadePort } from '../application/facades/care-coordination-facade-port';
import { GetIntakeStatusQuery } from '../application/queries/get-intake-status.query';
import { FORM_THROTTLE } from './form-throttle';

/**
 * New-client intake form (intake.yaml POST /clients/intake) plus the
 * Bearer-only status read. Optional auth on the form links the submission
 * to its owner — the pet-claim path Flow 2 depends on.
 */
@Controller('clients/intake')
@ApiTags('Intake')
export class ClientsIntakeController {
  constructor(private readonly care: CareCoordinationFacadePort) {}

  @Post()
  @OptionalAuth()
  @Throttle(FORM_THROTTLE)
  @Idempotent('intake')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    operationId: 'createIntakeSubmission',
    summary: 'New-client registration with optional history upload ids',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Replayed within 24h returns the original result; a conflicting body is 409.',
  })
  @ApiCreatedResponse({
    description: 'Intake received — int_… id with status received.',
  })
  @ApiBadRequestResponse({
    description:
      'VALIDATION_FAILED — bad fields, or historyUploadIds missing/foreign/already linked.',
  })
  @ApiConflictResponse({ description: 'IDEMPOTENCY_CONFLICT.' })
  @ApiResponse({
    status: 429,
    description: 'RATE_LIMITED — 5 submissions per 10 minutes per IP.',
  })
  createIntakeSubmission(
    @CurrentUser() user: AuthUser | undefined,
    @Body() body: IntakeSubmissionCreateDto,
  ): Promise<CreateIntakeSubmissionResultDto> {
    return this.care.createIntakeSubmission(
      new CreateIntakeSubmissionCommand(body, user?.id ?? null),
    );
  }

  @Get(':id/status')
  @ApiOperation({
    operationId: 'getIntakeStatus',
    summary: 'Intake submission status',
  })
  @ApiOkResponse({ description: 'Current status of the caller’s submission.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown or foreign submission.',
  })
  getIntakeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<IntakeStatusDto> {
    return this.care.getIntakeStatus(new GetIntakeStatusQuery(id, user.id));
  }
}
