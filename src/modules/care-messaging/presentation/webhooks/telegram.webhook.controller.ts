import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { Public } from '../../../../shared/cross-cutting/decorators';
import { TelegramUpdateHandler } from '../../application/handlers/telegram-update.handler';
import { invalidSecret } from '../../application/errors';

/**
 * Telegram Bot API webhook (openapi/messaging.yaml). Fails closed when the
 * secret is unset or does not match the `X-Telegram-Bot-Api-Secret-Token`
 * header. Body validation is intentionally left to the provider contract:
 * Telegram updates are large and evolve, so unknown fields are accepted.
 */
@ApiTags('Telegram Webhook')
@Controller('webhooks')
export class TelegramWebhookController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly updates: TelegramUpdateHandler,
  ) {}

  @Public()
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'telegramWebhook',
    summary: 'Receive Telegram update',
    description:
      'Validates X-Telegram-Bot-Api-Secret-Token, deduplicates update_id, ' +
      'creates forum topics for handoff conversations, and relays staff ' +
      'messages to the web chat via WebSocket.',
  })
  @ApiHeader({
    name: 'X-Telegram-Bot-Api-Secret-Token',
    required: true,
    description: 'Shared secret configured with setWebhook.',
  })
  @ApiResponse({ status: 200, description: 'Update acknowledged' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing secret token' })
  async receive(
    @Headers('x-telegram-bot-api-secret-token') provided: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: true }> {
    const expected = this.config.telegram?.webhookSecret;
    if (!expected || !provided || !safeEqual(provided, expected)) {
      throw invalidSecret();
    }

    await this.updates.execute(body);
    return { ok: true };
  }
}

/** Constant-time comparison that does not leak secret length. */
function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}
