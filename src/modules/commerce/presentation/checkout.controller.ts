import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiServiceUnavailableResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { IdempotencyInterceptor } from '../../../shared/idempotency/idempotency.interceptor';
import { CurrentUser } from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { CheckoutCommand } from '../application/commands/checkout.command';
import { CommerceFacadePort } from '../application/facades/commerce-facade-port';
import {
  CheckoutRequestDto,
  QuoteRequestDto,
} from '../application/dto/commerce.requests.dto';
import { OrderDto, QuoteDto } from '../application/dto/commerce.responses.dto';
import { CheckoutQuoteQuery } from '../application/queries/checkout-quote.query';

/** Checkout (commerce.yaml Checkout): quote → order + payment intent. */
@Controller()
@ApiTags('Checkout')
@ApiBearerAuth()
export class CheckoutController {
  constructor(private readonly commerce: CommerceFacadePort) {}

  @Post('checkout/quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'checkoutQuote',
    summary: 'Deterministic quote for the current cart',
  })
  @ApiOkResponse({
    description:
      'Totals: 20% VAT on subtotal, flat £4.99 shipping for ship (0 pickup/digital).',
  })
  @ApiBadRequestResponse({
    description:
      'VALIDATION_FAILED — empty cart, or digital with non-virtual lines.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'PRESCRIPTION_PENDING — Rx hold.',
  })
  quote(
    @CurrentUser() user: AuthUser,
    @Body() body: QuoteRequestDto,
  ): Promise<QuoteDto> {
    return this.commerce.checkoutQuote(
      new CheckoutQuoteQuery(
        user.id,
        body.fulfilmentMethod ?? 'ship',
        body.shippingAddress,
      ),
    );
  }

  @Post('checkout')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    operationId: 'checkout',
    summary: 'Place the order (reserves stock, opens the payment intent)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Replayed within 24h returns the original order; a conflicting body is 409.',
  })
  @ApiCreatedResponse({
    description: 'Order placed — pending_payment until the gateway captures.',
  })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED — empty cart or ineligible lines.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiConflictResponse({
    description: 'IDEMPOTENCY_CONFLICT or STOCK_CHANGED.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'PRESCRIPTION_PENDING — Rx hold.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'DEPENDENCY_UNAVAILABLE — payment gateway down (plain-language fallback).',
  })
  checkout(
    @CurrentUser() user: AuthUser,
    @Body() body: CheckoutRequestDto,
    @Headers('idempotency-key') idempotencyKey?: string | string[],
  ): Promise<OrderDto> {
    const key = Array.isArray(idempotencyKey)
      ? idempotencyKey[0]
      : idempotencyKey;
    return this.commerce.checkout(new CheckoutCommand(user.id, body, key));
  }
}
