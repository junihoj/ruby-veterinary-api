import {
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { APP_CONFIG } from '../../../config/config.types';
import type { AppConfig } from '../../../config/config.types';
import { Public } from '../../../shared/cross-cutting/decorators';
import { HandlePaymentWebhookCommand } from '../application/commands/handle-payment-webhook.command';
import { PaymentWebhookAckDto } from '../application/dto/commerce.responses.dto';
import { CommerceFacadePort } from '../application/facades/commerce-facade-port';
import {
  sha256Hex,
  verifyProviderSignature,
} from '../infrastructure/payment/provider-signature';

interface RawBodyRequest {
  rawBody?: Buffer;
}

/**
 * Inbound payment gateway webhook (webhooks.yaml Payments): provider
 * signature verification instead of bearer auth, immediate 200, dedupe by
 * event id. Never rate-limited — provider retries must not be throttled
 * (api-specification §Rate Limits). Rejections alert Operations (M6 wires
 * the inbox; M3a logs).
 */
@Controller('webhooks')
@Public()
@SkipThrottle()
@ApiTags('Webhooks')
export class PaymentsWebhookController {
  private readonly logger = new Logger(PaymentsWebhookController.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly commerce: CommerceFacadePort,
  ) {}

  @Post('payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'receivePaymentWebhook',
    summary: 'Payment gateway webhook (capture / failure / refund)',
  })
  @ApiOkResponse({
    description:
      'Accepted — duplicates acknowledge without re-running side effects.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_SIGNATURE — verification failed; alert raised.',
  })
  async receivePaymentWebhook(
    @Req() req: RawBodyRequest,
    @Headers('x-provider-signature') signature?: string,
  ): Promise<PaymentWebhookAckDto> {
    const rawBody = req.rawBody;
    // Fail closed: an unset PAYMENT_WEBHOOK_SECRET rejects every delivery.
    if (
      !verifyProviderSignature(
        rawBody,
        typeof signature === 'string' ? signature : undefined,
        this.config.paymentWebhookSecret,
      )
    ) {
      throw new HttpException(
        {
          code: 'INVALID_SIGNATURE',
          message: 'Webhook signature verification failed.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const event = parseEvent(rawBody);
    if (!event) {
      this.logger.warn(
        'Payments webhook body is not a well-formed event; acknowledged without processing.',
      );
      return { received: true, duplicate: false, ignored: true };
    }

    return this.commerce.handlePaymentWebhook(
      new HandlePaymentWebhookCommand(event, sha256Hex(rawBody as Buffer)),
    );
  }
}

/** Minimal structural check; contract has no 400 for this route. */
function parseEvent(rawBody?: Buffer) {
  if (!rawBody) return null;
  try {
    const parsed = JSON.parse(rawBody.toString('utf8')) as {
      id?: unknown;
      type?: unknown;
      data?: { payment_ref?: unknown };
    } | null;
    if (
      !parsed ||
      typeof parsed.id !== 'string' ||
      typeof parsed.type !== 'string' ||
      typeof parsed.data?.payment_ref !== 'string'
    ) {
      return null;
    }
    return {
      id: parsed.id,
      type: parsed.type,
      data: {
        payment_ref: parsed.data.payment_ref,
        ...(typeof (parsed.data as { order_ref?: unknown }).order_ref ===
        'string'
          ? { order_ref: (parsed.data as { order_ref: string }).order_ref }
          : {}),
      },
    };
  } catch {
    return null;
  }
}
