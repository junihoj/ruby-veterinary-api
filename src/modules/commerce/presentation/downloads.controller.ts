import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { CommerceFacadePort } from '../application/facades/commerce-facade-port';
import { DownloadUrlDto } from '../application/dto/commerce.responses.dto';
import { IssueDownloadUrlCommand } from '../application/commands/issue-download-url.command';

/** POST /downloads/{grantId}/url (commerce.yaml, M3b) — signed GET URL. */
@Controller('downloads')
@ApiTags('Orders')
@ApiBearerAuth()
export class DownloadsController {
  constructor(private readonly commerce: CommerceFacadePort) {}

  @Post(':grantId/url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'issueDownloadUrl',
    summary: 'Issue a short-lived signed URL for one granted file',
  })
  @ApiOkResponse({ description: 'Signed URL (short-lived).' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({
    description:
      'DOWNLOAD_NOT_AVAILABLE — grant revoked, expired, or exhausted.',
  })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown or foreign grant.',
  })
  issueUrl(
    @CurrentUser() user: AuthUser,
    @Param('grantId') grantId: string,
  ): Promise<DownloadUrlDto> {
    return this.commerce.issueDownloadUrl(
      new IssueDownloadUrlCommand(user.id, grantId),
    );
  }
}
