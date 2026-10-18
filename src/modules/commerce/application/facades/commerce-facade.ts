import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AdminCreateProductCommand } from '../commands/admin-create-product.command';
import { AdminUpdateProductCommand } from '../commands/admin-update-product.command';
import { AdminCreateDownloadFileCommand } from '../commands/admin-create-download-file.command';
import { AddCartItemCommand } from '../commands/add-cart-item.command';
import { CancelSubscriptionCommand } from '../commands/cancel-subscription.command';
import { CheckoutCommand } from '../commands/checkout.command';
import { ClearCartCommand } from '../commands/clear-cart.command';
import { CreateSubscriptionCommand } from '../commands/create-subscription.command';
import { EnsureCartCommand } from '../commands/ensure-cart.command';
import { HandlePaymentWebhookCommand } from '../commands/handle-payment-webhook.command';
import { IssueDownloadUrlCommand } from '../commands/issue-download-url.command';
import { RemoveCartItemCommand } from '../commands/remove-cart-item.command';
import { UpdateCartItemCommand } from '../commands/update-cart-item.command';
import { UpdateSubscriptionCommand } from '../commands/update-subscription.command';
import {
  CartDto,
  CartItemDto,
  DownloadFileGrantDto,
  DownloadFileUploadDto,
  DownloadUrlDto,
  OrderDto,
  PaymentWebhookAckDto,
  ProductDetailDto,
  ProductSummaryDto,
  QuoteDto,
  SubscriptionDto,
} from '../dto/commerce.responses.dto';
import { CheckoutQuoteQuery } from '../queries/checkout-quote.query';
import { GetCartQuery } from '../queries/get-cart.query';
import { GetOrderQuery } from '../queries/get-order.query';
import { GetProductQuery } from '../queries/get-product.query';
import { ListOrderDownloadsQuery } from '../queries/list-order-downloads.query';
import { ListOrdersQuery } from '../queries/list-orders.query';
import { ListProductsQuery } from '../queries/list-products.query';
import { ListSubscriptionsQuery } from '../queries/list-subscriptions.query';
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
  listOrderDownloads(
    query: ListOrderDownloadsQuery,
  ): Promise<DownloadFileGrantDto[]> {
    return this.queries.execute(query);
  }
  issueDownloadUrl(command: IssueDownloadUrlCommand): Promise<DownloadUrlDto> {
    return this.commands.execute(command);
  }
  listSubscriptions(query: ListSubscriptionsQuery): Promise<SubscriptionDto[]> {
    return this.queries.execute(query);
  }
  createSubscription(
    command: CreateSubscriptionCommand,
  ): Promise<SubscriptionDto> {
    return this.commands.execute(command);
  }
  updateSubscription(
    command: UpdateSubscriptionCommand,
  ): Promise<SubscriptionDto> {
    return this.commands.execute(command);
  }
  cancelSubscription(command: CancelSubscriptionCommand): Promise<void> {
    return this.commands.execute(command);
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
  adminCreateDownloadFile(
    command: AdminCreateDownloadFileCommand,
  ): Promise<DownloadFileUploadDto> {
    return this.commands.execute(command);
  }
  handlePaymentWebhook(
    command: HandlePaymentWebhookCommand,
  ): Promise<PaymentWebhookAckDto> {
    return this.commands.execute(command);
  }
}
