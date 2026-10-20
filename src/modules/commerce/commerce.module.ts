import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { IdempotencyStore } from '../../shared/idempotency/idempotency.store';
import { StorageModule } from '../../shared/storage/storage.module';
import { ClinicContentModule } from '../clinic-content/clinic-content.module';
import { ClientPatientRecordsModule } from '../client-patient-records/client-patient-records.module';
import { PharmacyAuthorisationModule } from '../pharmacy-authorisation/pharmacy-authorisation.module';
import { AdminCreateProductHandler } from './application/handlers/admin-create-product.handler';
import { AdminUpdateProductHandler } from './application/handlers/admin-update-product.handler';
import { AdminCreateDownloadFileHandler } from './application/handlers/admin-create-download-file.handler';
import { AddCartItemHandler } from './application/handlers/add-cart-item.handler';
import { CancelSubscriptionHandler } from './application/handlers/cancel-subscription.handler';
import { CheckoutHandler } from './application/handlers/checkout.handler';
import { CheckoutQuoteHandler } from './application/handlers/checkout-quote.handler';
import { ClearCartHandler } from './application/handlers/clear-cart.handler';
import { CreateSubscriptionHandler } from './application/handlers/create-subscription.handler';
import { EnsureCartHandler } from './application/handlers/ensure-cart.handler';
import { GetCartHandler } from './application/handlers/get-cart.handler';
import { GetOrderHandler } from './application/handlers/get-order.handler';
import { GetProductHandler } from './application/handlers/get-product.handler';
import { HandlePaymentWebhookHandler } from './application/handlers/handle-payment-webhook.handler';
import { HandlePrescriptionRejectedHandler } from './application/handlers/handle-prescription-rejected.handler';
import { ReleaseRxOrderHandler } from './application/handlers/release-rx-order.handler';
import { IssueDownloadUrlHandler } from './application/handlers/issue-download-url.handler';
import { ListOrderDownloadsHandler } from './application/handlers/list-order-downloads.handler';
import { ListOrdersHandler } from './application/handlers/list-orders.handler';
import { ListProductsHandler } from './application/handlers/list-products.handler';
import { ListSubscriptionsHandler } from './application/handlers/list-subscriptions.handler';
import { RemoveCartItemHandler } from './application/handlers/remove-cart-item.handler';
import { UpdateCartItemHandler } from './application/handlers/update-cart-item.handler';
import { UpdateSubscriptionHandler } from './application/handlers/update-subscription.handler';
import { CommerceFacade } from './application/facades/commerce-facade';
import { CommerceFacadePort } from './application/facades/commerce-facade-port';
import { CartRepository } from './infrastructure/repositories/cart.repository';
import { DownloadRepository } from './infrastructure/repositories/download.repository';
import { OrderRepository } from './infrastructure/repositories/order.repository';
import { PaymentRepository } from './infrastructure/repositories/payment.repository';
import { ProductRepository } from './infrastructure/repositories/product.repository';
import { SubscriptionRepository } from './infrastructure/repositories/subscription.repository';
import { MockPaymentGateway } from './infrastructure/payment/mock-payment.gateway';
import { PaymentGatewayPort } from './infrastructure/payment/payment-gateway.port';
import { SubscriptionTickService } from './infrastructure/subscription-tick.service';
import { AdminProductsController } from './presentation/admin-products.controller';
import { CartController } from './presentation/cart.controller';
import { CatalogController } from './presentation/catalog.controller';
import { CheckoutController } from './presentation/checkout.controller';
import { DownloadsController } from './presentation/downloads.controller';
import { OrdersController } from './presentation/orders.controller';
import { PaymentsWebhookController } from './presentation/payments-webhook.controller';
import { SubscriptionsController } from './presentation/subscriptions.controller';

/**
 * Commerce bounded context (schema: commerce) — M3a money path + M3b
 * composite & digital: catalog reads + admin CRUD (incl. download-file
 * uploads), cart/quote/checkout with per-variant and per-component stock
 * reservation, mock payment gateway + signed webhook capture, orders,
 * order downloads with signed URLs, subscriptions with an in-process
 * refill timer (commerce.yaml + webhooks.yaml). M5 wires the Rx flow:
 * checkout places the pharmacy hold through the PharmacyFacadePort
 * (compensating revert when it cannot stand), the capture gate releases
 * held orders only on pharmacy approval, and the PrescriptionApproved /
 * PrescriptionRejected consumers converge both payment/approval orderings
 * (Flow 4) — hence the PharmacyAuthorisationModule import. Add-to-cart
 * pet-claim checks consume the ClientRecordsFacadePort.
 */
@Module({
  imports: [
    CqrsModule,
    ClinicContentModule,
    StorageModule,
    ClientPatientRecordsModule,
    PharmacyAuthorisationModule,
  ],
  controllers: [
    CatalogController,
    CartController,
    CheckoutController,
    OrdersController,
    DownloadsController,
    SubscriptionsController,
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
    DownloadRepository,
    SubscriptionRepository,
    SubscriptionTickService,
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
    ListOrderDownloadsHandler,
    IssueDownloadUrlHandler,
    ListSubscriptionsHandler,
    CreateSubscriptionHandler,
    UpdateSubscriptionHandler,
    CancelSubscriptionHandler,
    AdminCreateProductHandler,
    AdminUpdateProductHandler,
    AdminCreateDownloadFileHandler,
    HandlePaymentWebhookHandler,
    // M5 Rx flow: the first integration-event consumers in the codebase.
    ReleaseRxOrderHandler,
    HandlePrescriptionRejectedHandler,
  ],
  exports: [CommerceFacadePort],
})
export class CommerceModule {}
