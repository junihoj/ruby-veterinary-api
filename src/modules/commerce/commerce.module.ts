import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { IdempotencyStore } from '../../shared/idempotency/idempotency.store';
import { ClinicContentModule } from '../clinic-content/clinic-content.module';
import { AdminCreateProductHandler } from './application/handlers/admin-create-product.handler';
import { AdminUpdateProductHandler } from './application/handlers/admin-update-product.handler';
import { AddCartItemHandler } from './application/handlers/add-cart-item.handler';
import { CheckoutHandler } from './application/handlers/checkout.handler';
import { CheckoutQuoteHandler } from './application/handlers/checkout-quote.handler';
import { ClearCartHandler } from './application/handlers/clear-cart.handler';
import { EnsureCartHandler } from './application/handlers/ensure-cart.handler';
import { GetCartHandler } from './application/handlers/get-cart.handler';
import { GetOrderHandler } from './application/handlers/get-order.handler';
import { GetProductHandler } from './application/handlers/get-product.handler';
import { HandlePaymentWebhookHandler } from './application/handlers/handle-payment-webhook.handler';
import { ListOrdersHandler } from './application/handlers/list-orders.handler';
import { ListProductsHandler } from './application/handlers/list-products.handler';
import { RemoveCartItemHandler } from './application/handlers/remove-cart-item.handler';
import { UpdateCartItemHandler } from './application/handlers/update-cart-item.handler';
import { CommerceFacade } from './application/facades/commerce-facade';
import { CommerceFacadePort } from './application/facades/commerce-facade-port';
import { CartRepository } from './infrastructure/repositories/cart.repository';
import { OrderRepository } from './infrastructure/repositories/order.repository';
import { PaymentRepository } from './infrastructure/repositories/payment.repository';
import { ProductRepository } from './infrastructure/repositories/product.repository';
import { MockPaymentGateway } from './infrastructure/payment/mock-payment.gateway';
import { PaymentGatewayPort } from './infrastructure/payment/payment-gateway.port';
import { AdminProductsController } from './presentation/admin-products.controller';
import { CartController } from './presentation/cart.controller';
import { CatalogController } from './presentation/catalog.controller';
import { CheckoutController } from './presentation/checkout.controller';
import { OrdersController } from './presentation/orders.controller';
import { PaymentsWebhookController } from './presentation/payments-webhook.controller';

/**
 * Commerce bounded context (schema: commerce) — M3a money path: catalog
 * reads + admin CRUD, cart/quote/checkout with per-variant stock
 * reservation, mock payment gateway + signed webhook capture, orders
 * (commerce.yaml + webhooks.yaml). Composite lines and downloads are M3b.
 */
@Module({
  imports: [CqrsModule, ClinicContentModule],
  controllers: [
    CatalogController,
    CartController,
    CheckoutController,
    OrdersController,
    AdminProductsController,
    PaymentsWebhookController,
  ],
  providers: [
    CommerceFacade,
    { provide: CommerceFacadePort, useExisting: CommerceFacade },
    ProductRepository,
    CartRepository,
    OrderRepository,
    PaymentRepository,
    IdempotencyStore,
    // Deterministic mock gateway; the real adapter swaps in behind the same
    // port (ADR-0007 — references only, never card data).
    { provide: PaymentGatewayPort, useClass: MockPaymentGateway },
    ListProductsHandler,
    GetProductHandler,
    GetCartHandler,
    EnsureCartHandler,
    ClearCartHandler,
    AddCartItemHandler,
    UpdateCartItemHandler,
    RemoveCartItemHandler,
    CheckoutQuoteHandler,
    CheckoutHandler,
    ListOrdersHandler,
    GetOrderHandler,
    AdminCreateProductHandler,
    AdminUpdateProductHandler,
    HandlePaymentWebhookHandler,
  ],
  exports: [CommerceFacadePort],
})
export class CommerceModule {}
