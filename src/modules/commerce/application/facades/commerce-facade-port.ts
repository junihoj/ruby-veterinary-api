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

export interface PagedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Public API of the Commerce context (§6.1). Other modules depend only on
 * this abstract port, bound to the concrete facade with `useExisting` (§3).
 *
 * M3a: catalog reads + admin CRUD, cart/quote/checkout, orders, payments
 * webhook (commerce.yaml + webhooks.yaml). Consumers today: none (pharmacy
 * authorisation arrives in Phase 5).
 */
export abstract class CommerceFacadePort {
  abstract listProducts(
    query: ListProductsQuery,
  ): Promise<PagedResult<ProductSummaryDto>>;
  abstract getProduct(query: GetProductQuery): Promise<ProductDetailDto>;
  abstract getCart(query: GetCartQuery): Promise<CartDto>;
  abstract ensureCart(command: EnsureCartCommand): Promise<CartDto>;
  abstract clearCart(command: ClearCartCommand): Promise<void>;
  abstract addCartItem(command: AddCartItemCommand): Promise<CartItemDto>;
  abstract updateCartItem(command: UpdateCartItemCommand): Promise<CartDto>;
  abstract removeCartItem(command: RemoveCartItemCommand): Promise<void>;
  abstract checkoutQuote(query: CheckoutQuoteQuery): Promise<QuoteDto>;
  abstract checkout(command: CheckoutCommand): Promise<OrderDto>;
  abstract listOrders(query: ListOrdersQuery): Promise<PagedResult<OrderDto>>;
  abstract getOrder(query: GetOrderQuery): Promise<OrderDto>;
  abstract adminCreateProduct(
    command: AdminCreateProductCommand,
  ): Promise<ProductDetailDto>;
  abstract adminUpdateProduct(
    command: AdminUpdateProductCommand,
  ): Promise<ProductDetailDto>;
  abstract handlePaymentWebhook(
    command: HandlePaymentWebhookCommand,
  ): Promise<PaymentWebhookAckDto>;
}
