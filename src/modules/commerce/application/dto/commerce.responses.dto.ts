import { ShippingAddressDto } from './commerce.requests.dto';

/**
 * Commerce API response shapes (commerce.yaml M3a). Money is always a
 * decimal string, ids are always prefixed (prd_/var_/crt_/cit_/ord_/oit_/
 * ful_/pay_), and card data never appears (ADR-0007).
 */

export interface ProductCategoryRefDto {
  id: string;
  name: string;
  slug: string;
}

export interface ProductVariantDto {
  id: string;
  name: string;
  sku: string;
  price: string;
  compareAtPrice: string | null;
  currency: string;
  availableQuantity: number;
  stockReserved: number;
  isDefault: boolean;
  active: boolean;
  weightGrams: number | null;
}

export interface ProductFacetsDto {
  petTypes: string[];
  lifeStages: string[];
  conditions: string[];
}

export interface ProductSummaryDto {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  summary: string;
  productType: string;
  isVirtual: boolean;
  isDownloadable: boolean;
  requiresPrescription: boolean;
  featured: boolean;
  /** false for grouped/external/composite (M3a: composite blocked until 3b). */
  purchasable: boolean;
  fromPrice: string | null;
  currency: string | null;
  externalUrl: string | null;
  buttonText: string | null;
  category: ProductCategoryRefDto;
}

export interface ProductDetailDto extends ProductSummaryDto {
  descriptionMd: string | null;
  requiresPetClaim: boolean;
  pricingMode: string | null;
  published: boolean;
  facets: ProductFacetsDto;
  variants: ProductVariantDto[];
  members: Array<{
    productId: string;
    name: string;
    slug: string;
    summary: string;
    fromPrice: string | null;
    sortOrder: number;
  }>;
  slots: Array<{
    id: string;
    name: string;
    description: string | null;
    position: number;
    minSelect: number;
    maxSelect: number;
    options: Array<{
      id: string;
      productId: string;
      name: string;
      slug: string;
      variantId: string | null;
      quantity: number;
      priceOverride: string | null;
    }>;
  }>;
}

export interface CartItemComponentDto {
  slotId: string;
  productId: string;
  variantId: string;
  quantity: number;
}

export interface CartItemDto {
  id: string;
  productId: string;
  /** null for sum-priced composite lines (commerce.md cart_items). */
  variantId: string | null;
  name: string;
  slug: string;
  variantName: string | null;
  productType: string;
  requiresPrescription: boolean;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  currency: string;
  petId: string | null;
  addedAt: string;
  /** Composite selections (pick list); empty for plain variant lines. */
  components: CartItemComponentDto[];
}

export interface CartDto {
  id: string | null;
  status: string;
  /** Sum of line quantities. */
  itemCount: number;
  subtotal: string;
  currency: string;
  items: CartItemDto[];
}

export interface QuoteLineDto {
  /** null for sum-priced composite lines. */
  variantId: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface QuoteDto {
  fulfilmentMethod: string;
  currency: string;
  subtotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  lines: QuoteLineDto[];
}

export interface OrderItemDto {
  id: string;
  productId: string;
  variantId: string | null;
  name: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  petId: string | null;
  /** Composite selection snapshot (staff pick list); [] on plain lines. */
  components: Array<{
    slotId: string;
    productId: string;
    variantId: string;
    quantity: number;
  }>;
}

/** Grant summary attached to the order detail (file detail lives on
 *  GET /orders/{id}/downloads). */
export interface OrderDownloadGrantDto {
  id: string;
  productId: string;
  downloadsUsed: number;
  maxDownloads: number | null;
  expiresAt: string | null;
  revoked: boolean;
}

export interface FulfilmentDto {
  id: string;
  method: string;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  pickupCode: string | null;
  estimatedReadyAt: string | null;
  completedAt: string | null;
}

export interface PaymentDto {
  id: string;
  gateway: string;
  status: string;
  amount: string;
  currency: string;
  gatewayPaymentRef: string | null;
  failureCode: string | null;
  capturedAt: string | null;
}

export interface OrderDto {
  id: string;
  status: string;
  currency: string;
  subtotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  fulfilmentMethod: string;
  shippingAddress: ShippingAddressDto | null;
  /** Filled by Pharmacy (M5); always null while Rx lines are blocked. */
  /** Aggregate pharmacy state of this order (M5: null = no Rx lines). */
  prescriptionStatus: string | null;
  placedAt: string;
  updatedAt: string;
  items: OrderItemDto[];
  fulfilment: FulfilmentDto | null;
  payment: PaymentDto | null;
  /** Download entitlements issued at capture (M3b); [] until paid. */
  downloads: OrderDownloadGrantDto[];
}

/** POST /webhooks/payments acknowledgement body. */
export interface PaymentWebhookAckDto {
  received: boolean;
  duplicate: boolean;
  ignored?: boolean;
}

/** GET /orders/{id}/downloads — one entry per granted file (M3b). */
export interface DownloadFileGrantDto {
  grantId: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  downloadsUsed: number;
  maxDownloads: number | null;
  /** null when maxDownloads is null (unlimited). */
  remainingDownloads: number | null;
  expiresAt: string | null;
  revoked: boolean;
}

/** POST /downloads/{grantId}/url — short-lived signed GET URL (M3b). */
export interface DownloadUrlDto {
  grantId: string;
  fileName: string;
  url: string;
  expiresIn: number;
}

/** Subscription auto-refill row (commerce.yaml Subscriptions). */
export interface SubscriptionDto {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  petId: string | null;
  frequency: string;
  status: string;
  nextOrderAt: string;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /admin/products/{id}/download-files — record + presigned PUT. */
export interface DownloadFileUploadDto {
  id: string;
  productId: string;
  fileName: string;
  objectKey: string;
  fileSizeBytes: number;
  mimeType: string;
  uploadUrl: string;
  uploadExpiresIn: number;
}
