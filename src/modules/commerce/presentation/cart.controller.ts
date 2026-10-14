import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { CommerceFacadePort } from '../application/facades/commerce-facade-port';
import { AddCartItemCommand } from '../application/commands/add-cart-item.command';
import { ClearCartCommand } from '../application/commands/clear-cart.command';
import { EnsureCartCommand } from '../application/commands/ensure-cart.command';
import { RemoveCartItemCommand } from '../application/commands/remove-cart-item.command';
import { UpdateCartItemCommand } from '../application/commands/update-cart-item.command';
import {
  AddCartItemDto,
  UpdateCartItemDto,
} from '../application/dto/commerce.requests.dto';
import {
  CartDto,
  CartItemDto,
} from '../application/dto/commerce.responses.dto';
import { GetCartQuery } from '../application/queries/get-cart.query';

/** Cart operations (commerce.yaml Cart) — Bearer, one open cart per user. */
@Controller('cart')
@ApiTags('Cart')
@ApiBearerAuth()
export class CartController {
  constructor(private readonly commerce: CommerceFacadePort) {}

  @Get()
  @ApiOperation({ operationId: 'getCart', summary: 'Current open cart' })
  @ApiOkResponse({ description: 'Cart (empty shape when none exists yet).' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  getCart(@CurrentUser() user: AuthUser): Promise<CartDto> {
    return this.commerce.getCart(new GetCartQuery(user.id));
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'ensureCart',
    summary: 'Ensure the caller has an open cart',
  })
  @ApiOkResponse({ description: 'Existing or newly created cart.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  ensureCart(@CurrentUser() user: AuthUser): Promise<CartDto> {
    return this.commerce.ensureCart(new EnsureCartCommand(user.id));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'clearCart', summary: 'Remove every cart line' })
  @ApiNoContentResponse({ description: 'Cart cleared (idempotent).' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  async clearCart(@CurrentUser() user: AuthUser): Promise<void> {
    await this.commerce.clearCart(new ClearCartCommand(user.id));
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'addCartItem',
    summary: 'Add a variant to the cart (merges into an existing line)',
  })
  @ApiCreatedResponse({ description: 'The new or merged cart line.' })
  @ApiBadRequestResponse({
    description:
      'VALIDATION_FAILED — unknown variant, external/grouped/composite line, unpublished product.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiConflictResponse({ description: 'STOCK_CHANGED — not enough available.' })
  @ApiUnprocessableEntityResponse({
    description: 'PRESCRIPTION_PENDING — Rx hold at add-to-cart.',
  })
  addCartItem(
    @CurrentUser() user: AuthUser,
    @Body() body: AddCartItemDto,
  ): Promise<CartItemDto> {
    return this.commerce.addCartItem(new AddCartItemCommand(user.id, body));
  }

  @Patch('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'updateCartItem',
    summary: 'Set a line quantity (0 removes the line)',
  })
  @ApiOkResponse({ description: 'The refreshed cart.' })
  @ApiQuery({
    name: 'itemId',
    required: true,
    description: 'cit_… line id',
  })
  @ApiBadRequestResponse({
    description: 'VALIDATION_FAILED — unknown or foreign cart item.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  updateCartItem(
    @CurrentUser() user: AuthUser,
    @Query('itemId') itemId: string,
    @Body() body: UpdateCartItemDto,
  ): Promise<CartDto> {
    return this.commerce.updateCartItem(
      new UpdateCartItemCommand(user.id, itemId, body.quantity),
    );
  }

  @Delete('items')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'removeCartItem',
    summary: 'Remove a cart line',
  })
  @ApiNoContentResponse({ description: 'Line removed (idempotent).' })
  @ApiQuery({ name: 'itemId', required: true, description: 'cit_… line id' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  async removeCartItem(
    @CurrentUser() user: AuthUser,
    @Query('itemId') itemId: string,
  ): Promise<void> {
    await this.commerce.removeCartItem(
      new RemoveCartItemCommand(user.id, itemId),
    );
  }
}
