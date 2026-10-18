import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { CommerceFacadePort } from '../application/facades/commerce-facade-port';
import {
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
} from '../application/dto/commerce.requests.dto';
import { SubscriptionDto } from '../application/dto/commerce.responses.dto';
import { CancelSubscriptionCommand } from '../application/commands/cancel-subscription.command';
import { CreateSubscriptionCommand } from '../application/commands/create-subscription.command';
import { UpdateSubscriptionCommand } from '../application/commands/update-subscription.command';
import { ListSubscriptionsQuery } from '../application/queries/list-subscriptions.query';

/**
 * Subscription auto-refill (commerce.yaml Subscriptions, M3b) — Bearer,
 * owner-scoped. Physical simple/variable products only.
 */
@Controller('subscriptions')
@ApiTags('Subscriptions')
@ApiBearerAuth()
export class SubscriptionsController {
  constructor(private readonly commerce: CommerceFacadePort) {}

  @Get()
  @ApiOperation({
    operationId: 'listSubscriptions',
    summary: 'List auto-refill subscriptions',
  })
  @ApiOkResponse({ description: 'Subscriptions (newest first).' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  list(@CurrentUser() user: AuthUser): Promise<SubscriptionDto[]> {
    return this.commerce.listSubscriptions(new ListSubscriptionsQuery(user.id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'createSubscription',
    summary: 'Create subscription (physical simple/variable only)',
  })
  @ApiCreatedResponse({ description: 'Created; first order one period out.' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'SUBSCRIPTION_NOT_AVAILABLE — unknown variant, non-physical or ' +
      'non-purchasable product.',
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    return this.commerce.createSubscription(
      new CreateSubscriptionCommand(user.id, body),
    );
  }

  @Patch(':id')
  @ApiOperation({
    operationId: 'updateSubscription',
    summary: 'Pause, resume, or cancel subscription',
  })
  @ApiOkResponse({ description: 'Updated subscription.' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown or foreign subscription.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    return this.commerce.updateSubscription(
      new UpdateSubscriptionCommand(user.id, id, body),
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'cancelSubscription',
    summary: 'Cancel subscription (stops future orders)',
  })
  @ApiNoContentResponse({
    description: 'Cancelled — unknown ids are a 204 no-op.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.commerce.cancelSubscription(
      new CancelSubscriptionCommand(user.id, id),
    );
  }
}
