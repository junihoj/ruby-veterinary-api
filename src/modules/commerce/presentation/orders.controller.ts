import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { toLimit } from '../../../shared/cross-cutting/pagination';
import { CurrentUser } from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { CommerceFacadePort } from '../application/facades/commerce-facade-port';
import { OrderDto } from '../application/dto/commerce.responses.dto';
import { GetOrderQuery } from '../application/queries/get-order.query';
import { ListOrdersQuery } from '../application/queries/list-orders.query';

/** Order history (commerce.yaml Orders) — Bearer, owner-scoped reads. */
@Controller('orders')
@ApiTags('Orders')
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly commerce: CommerceFacadePort) {}

  @Get()
  @ApiOperation({
    operationId: 'listOrders',
    summary: 'Order history with fulfilment and payment state',
  })
  @ApiOkResponse({ description: 'Orders (cursor-paginated, newest first).' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '1–100, default 20',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'ord_… page cursor',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  async listOrders(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{
    data: OrderDto[];
    meta: {
      pagination: { limit: number; cursor: string | null; hasMore: boolean };
    };
  }> {
    const pageLimit = toLimit(limit);
    const result = await this.commerce.listOrders(
      new ListOrdersQuery(user.id, pageLimit, cursor),
    );
    return {
      data: result.data,
      meta: {
        pagination: {
          limit: pageLimit,
          cursor: result.nextCursor,
          hasMore: result.hasMore,
        },
      },
    };
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'getOrder',
    summary: 'Single order including prescription status',
  })
  @ApiOkResponse({ description: 'The owned order.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown or foreign order.',
  })
  getOrder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<OrderDto> {
    return this.commerce.getOrder(new GetOrderQuery(user.id, id));
  }
}
