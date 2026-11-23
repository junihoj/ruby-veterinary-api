import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../../shared/cross-cutting/decorators';
import { FORM_THROTTLE } from '../../care-coordination/presentation/form-throttle';
import { SubscribeNewsletterCommand } from '../application/commands/subscribe-newsletter.command';
import { SubscribeNewsletterDto } from '../application/dto/publishing.requests.dto';
import { NewsletterSubscriptionDto } from '../application/dto/publishing.responses.dto';
import { PublishingFacadePort } from '../application/facades/publishing-facade-port';

/** Public newsletter capture (publishing.yaml M7). */
@Controller('newsletter')
@ApiTags('Publishing')
export class NewsletterController {
  constructor(private readonly publishing: PublishingFacadePort) {}

  @Post('subscribe')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @Throttle(FORM_THROTTLE)
  @ApiOperation({
    operationId: 'subscribeNewsletter',
    summary: 'Newsletter email capture (rate limited, idempotent UX)',
  })
  @ApiCreatedResponse({
    description: 'Subscription recorded (pending or existing active).',
  })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiResponse({
    status: 429,
    description: 'RATE_LIMITED — 5 submissions per 10 minutes per IP.',
  })
  subscribe(
    @Body() body: SubscribeNewsletterDto,
  ): Promise<NewsletterSubscriptionDto> {
    return this.publishing.subscribeNewsletter(
      new SubscribeNewsletterCommand(body),
    );
  }
}
