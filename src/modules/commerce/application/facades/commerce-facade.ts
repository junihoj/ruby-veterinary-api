import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AdminCreateProductCommand } from '../commands/admin-create-product.command';
import { AdminUpdateProductCommand } from '../commands/admin-update-product.command';
import { AddCartItemCommand } from '../commands/add-cart-item.command';
import { CheckoutCommand } from '../commands/checkout.command';
import { ClearCartCommand } from '../commands/clear-cart.command';
import { EnsureCartCommand } from '../commands/ensure-cart.command';
import { HandlePaymentWebhookCommand } from '../commands/handle-payment-webhook.command';
import { RemoveCartItemCommand } from '../commands/remove-cart-item.command';
import { UpdateCartItemCommand } from '../commands/update-cart-item.command';
import {
  CartDto,
  CartItemDto,
  OrderDto,
  PaymentWebhookAckDto,
  ProductDetailDto,
  ProductSummaryDto,
  QuoteDto,
} from '../dto/commerce.responses.dto';
import { CheckoutQuoteQuery } from '../queries/checkout-quote.query';
import { GetCartQuery } from '../queries/get-cart.query';
import { GetOrderQuery } from '../queries/get-order.query';
import { GetProductQuery } from '../queries/get-product.query';
import { ListOrdersQuery } from '../queries/list-orders.query';
import { ListProductsQuery } from '../queries/list-products.query';
import { CommerceFacadePort, PagedResult } from './commerce-facade-port';

/**
 * Concrete facade for the Commerce context (§3). Body is bus delegation only —
 * no business logic. Handlers own the behaviour.
 */
@Injectable()
export class CommerceFacade implements CommerceFacadePort {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  listProducts(
    query: ListProductsQuery,
  ): Promise<PagedResult<ProductSummaryDto>> {
    return this.queries.execute(query);
  }
  getProduct(query: GetProductQuery): Promise<ProductDetailDto> {
    return this.queries.execute(query);
  }
  getCart(query: GetCartQuery): Promise<CartDto> {
    return this.queries.execute(query);
  }
  ensureCart(command: EnsureCartCommand): Promise<CartDto> {
    return this.commands.execute(command);
  }
  clearCart(command: ClearCartCommand): Promise<void> {
    return this.commands.execute(command);
  }
  addCartItem(command: AddCartItemCommand): Promise<CartItemDto> {
    return this.commands.execute(command);
  }
  updateCartItem(command: UpdateCartItemCommand): Promise<CartDto> {
    return this.commands.execute(command);
  }
  removeCartItem(command: RemoveCartItemCommand): Promise<void> {
    return this.commands.execute(command);
  }
  checkoutQuote(query: CheckoutQuoteQuery): Promise<QuoteDto> {
    return this.queries.execute(query);
  }
  checkout(command: CheckoutCommand): Promise<OrderDto> {
    return this.commands.execute(command);
  }
  listOrders(query: ListOrdersQuery): Promise<PagedResult<OrderDto>> {
    return this.queries.execute(query);
  }
  getOrder(query: GetOrderQuery): Promise<OrderDto> {
    return this.queries.execute(query);
  }
  adminCreateProduct(
    command: AdminCreateProductCommand,
  ): Promise<ProductDetailDto> {
    return this.commands.execute(command);
  }
  adminUpdateProduct(
    command: AdminUpdateProductCommand,
  ): Promise<ProductDetailDto> {
    return this.commands.execute(command);
  }
  handlePaymentWebhook(
    command: HandlePaymentWebhookCommand,
  ): Promise<PaymentWebhookAckDto> {
    return this.commands.execute(command);
  }
}
