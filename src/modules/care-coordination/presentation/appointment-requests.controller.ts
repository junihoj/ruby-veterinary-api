import { Body, Controller, Post, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  OptionalAuth,
} from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { IdempotencyInterceptor } from '../../../shared/idempotency/idempotency.interceptor';
import { Idempotent } from '../../../shared/idempotency/idempotency.decorator';
import { CreateAppointmentRequestCommand } from '../application/commands/create-appointment-request.command';
import { AppointmentRequestCreateDto } from '../application/dto/care.requests.dto';
import { CreateAppointmentRequestResultDto } from '../application/dto/care.responses.dto';
import { CareCoordinationFacadePort } from '../application/facades/care-coordination-facade-port';
import { FORM_THROTTLE } from './form-throttle';

/**
 * Appointment request form (intake.yaml POST /appointment-requests).
 * Optional auth: an owner token, when present and valid, links the request
 * to their account — an absent or garbage token stays anonymous and never
 * 401s (`security: []` in the contract).
 */
@Controller('appointment-requests')
@ApiTags('Intake')
export class AppointmentRequestsController {
  constructor(private readonly care: CareCoordinationFacadePort) {}

  @Post()
  @OptionalAuth()
  @Throttle(FORM_THROTTLE)
  @Idempotent('appointment-request')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    operationId: 'createAppointmentRequest',
    summary: 'Submit an appointment request',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Replayed within 24h returns the original result; a conflicting body is 409.',
  })
  @ApiCreatedResponse({ description: 'Request received — apt_… id.' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiConflictResponse({ description: 'IDEMPOTENCY_CONFLICT.' })
  @ApiResponse({
    status: 429,
    description: 'RATE_LIMITED — 5 submissions per 10 minutes per IP.',
  })
  createAppointmentRequest(
    @CurrentUser() user: AuthUser | undefined,
    @Body() body: AppointmentRequestCreateDto,
  ): Promise<CreateAppointmentRequestResultDto> {
    return this.care.createAppointmentRequest(
      new CreateAppointmentRequestCommand(body, user?.id ?? null),
    );
  }
}
