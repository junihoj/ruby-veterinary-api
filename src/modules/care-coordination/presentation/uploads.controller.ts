import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { SignUploadCommand } from '../application/commands/sign-upload.command';
import { SignUploadDto } from '../application/dto/care.requests.dto';
import { SignUploadResultDto } from '../application/dto/care.responses.dto';
import { CareCoordinationFacadePort } from '../application/facades/care-coordination-facade-port';

/**
 * Signed upload URL issuing (intake.yaml POST /uploads/sign) — Bearer,
 * direct-to-SeaweedFS, no file bytes through the API (ADR-0016).
 */
@Controller('uploads')
@ApiTags('Intake')
@ApiBearerAuth()
export class UploadsController {
  constructor(private readonly care: CareCoordinationFacadePort) {}

  @Post('sign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'signUpload',
    summary: 'Issue signed direct-to-object-storage upload URL',
  })
  @ApiOkResponse({
    description:
      'Signed PUT details — medical_history also returns the upl_… id to submit later.',
  })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED — bad purpose/mimeType/byteSize fields.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiPayloadTooLargeResponse({
    description: 'UPLOAD_TOO_LARGE — over the 10 MB cap.',
  })
  signUpload(
    @CurrentUser() user: AuthUser,
    @Body() body: SignUploadDto,
  ): Promise<SignUploadResultDto> {
    return this.care.signUpload(new SignUploadCommand(body, user.id));
  }
}
