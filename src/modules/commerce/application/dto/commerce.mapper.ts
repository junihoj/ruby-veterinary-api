import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { CURRENCY, fromPence, toPence } from '../money';
import { badRequest } from '../errors';
import { ShippingAddressDto } from './commerce.requests.dto';
import {
  CartDto,
  CartItemDto,
  FulfilmentDto,
  OrderDto,
  OrderItemDto,
  PaymentDto,
  ProductDetailDto,
  ProductFacetsDto,
  ProductSummaryDto,
  ProductVariantDto,
} from './commerce.responses.dto';

/**
 * Row → DTO mapping for the commerce context. Prisma payloads (with the
 * `include`s the repositories apply) are structurally assignable to the row
 * shapes below — only the fields the mapper reads are declared. Decimal
 * values become two-decimal strings; ids become prefixed opaque strings
 * (api-specification §Identifiers).
 */

type DecimalLike = { toString(): string };
type DateLike = { toISOString(): string };

export interface VariantRow {
  id: string;
  name: string;
  sku: string;
  price: DecimalLike;
  compareAtPrice: DecimalLike | null;
  currency: string;
  stockQuantity: number;
  stockReserved: number;
  isDefault: boolean;
  active: boolean;
  weightGrams: number | null;
}

export interface ProductRow {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  summary: string;
  productType: string;
  isVirtual: boolean;
  isDownloadable: boolean;
  requiresPrescription: boolean;
  requiresPetClaim: boolean;
  featured: boolean;
  published: boolean;
  descriptionMd: string | null;
  pricingMode: string | null;
  externalUrl: string | null;
  buttonText: string | null;
  category: { id: string; name: string; slug: string };
}

export interface ProductDetailRow extends ProductRow {
  variants: VariantRow[];
  facets: Array<{ facet: { facetType: string; value: string } }>;
  groupedParent: Array<{
    sortOrder: number;
    memberProduct: {
      id: string;
      name: string;
      slug: string;
      summary: string;
      variants: VariantRow[];
    };
  }>;
  compositeSlots: Array<{
    id: string;
    name: string;
    description: string | null;
    position: number;
    minSelect: number;
    maxSelect: number;
    options: Array<{
      id: string;
      productId: string;
      quantity: number;
      priceOverride: DecimalLike | null;
      componentVariantId: string | null;
      product: { id: string; name: string; slug: string };
    }>;
  }>;
}

/** M3a purchasable shapes: composite (3b) and grouped/external never are. */
function isPurchasable(productType: string): boolean {
  return productType === 'simple' || productType === 'variable';
}

function fromPriceOf(variants: VariantRow[]): string | null {
  const prices = variants
    .filter((v) => v.active)
    .map((v) => toPence(v.price.toString()));
  return prices.length ? fromPence(Math.min(...prices)) : null;
}

function currencyOf(variants: VariantRow[]): string | null {
  const first = variants.find((v) => v.active);
  return first ? first.currency : null;
}

export function toVariantDto(row: VariantRow): ProductVariantDto {
  return {
    id: PrefixedId.format('variant', row.id),
    name: row.name,
    sku: row.sku,
    price: fromPence(toPence(row.price.toString())),
    compareAtPrice: row.compareAtPrice
      ? fromPence(toPence(row.compareAtPrice.toString()))
      : null,
    currency: row.currency,
    availableQuantity: Math.max(row.stockQuantity - row.stockReserved, 0),
    stockReserved: row.stockReserved,
    isDefault: row.isDefault,
    active: row.active,
    weightGrams: row.weightGrams,
  };
}

export function toProductSummary(
  row: ProductRow,
  variants: VariantRow[] = [],
): ProductSummaryDto {
  return {
    id: PrefixedId.format('product', row.id),
    categoryId: PrefixedId.format('productCategory', row.categoryId),
    name: row.name,
    slug: row.slug,
    summary: row.summary,
    productType: row.productType,
    isVirtual: row.isVirtual,
    isDownloadable: row.isDownloadable,
    requiresPrescription: row.requiresPrescription,
    featured: row.featured,
    purchasable: isPurchasable(row.productType),
    fromPrice: fromPriceOf(variants),
    currency: currencyOf(variants),
    externalUrl: row.externalUrl,
    buttonText: row.buttonText,
    category: {
      id: PrefixedId.format('productCategory', row.category.id),
      name: row.category.name,
      slug: row.category.slug,
    },
  };
}

function toFacets(row: ProductDetailRow['facets']): ProductFacetsDto {
  const facets: ProductFacetsDto = {
    petTypes: [],
    lifeStages: [],
    conditions: [],
  };
  for (const link of row) {
    if (link.facet.facetType === 'pet_type') {
      facets.petTypes.push(link.facet.value);
    } else if (link.facet.facetType === 'life_stage') {
      facets.lifeStages.push(link.facet.value);
    } else if (link.facet.facetType === 'health_condition') {
      facets.conditions.push(link.facet.value);
    }
  }
  return facets;
}

export function toProductDetail(row: ProductDetailRow): ProductDetailDto {
  return {
    ...toProductSummary(row, row.variants),
    descriptionMd: row.descriptionMd,
    requiresPetClaim: row.requiresPetClaim,
    pricingMode: row.pricingMode,
    published: row.published,
    facets: toFacets(row.facets),
    variants: row.variants.map(toVariantDto),
    members: row.groupedParent.map((link) => ({
      productId: PrefixedId.format('product', link.memberProduct.id),
      name: link.memberProduct.name,
      slug: link.memberProduct.slug,
      summary: link.memberProduct.summary,
      fromPrice: fromPriceOf(link.memberProduct.variants),
      sortOrder: link.sortOrder,
    })),
    slots: row.compositeSlots.map((slot) => ({
      id: PrefixedId.format('compositeSlot', slot.id),
      name: slot.name,
      description: slot.description,
      position: slot.position,
      minSelect: slot.minSelect,
      maxSelect: slot.maxSelect,
      options: slot.options.map((option) => ({
        id: PrefixedId.format('compositeSlotOption', option.id),
        productId: PrefixedId.format('product', option.productId),
        name: option.product.name,
        slug: option.product.slug,
        variantId: option.componentVariantId
          ? PrefixedId.format('variant', option.componentVariantId)
          : null,
        quantity: option.quantity,
        priceOverride: option.priceOverride
          ? fromPence(toPence(option.priceOverride.toString()))
          : null,
      })),
    })),
  };
}

export interface CartItemRow {
  id: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  petId: string | null;
  addedAt: DateLike;
  variant: {
    name: string;
    price: DecimalLike;
    currency: string;
    product: {
      name: string;
      slug: string;
      productType: string;
      requiresPrescription: boolean;
      isVirtual: boolean;
      isDownloadable: boolean;
    };
  };
}

/**
 * What Prisma actually returns (Cart.variant is optional in the schema).
 * M3a lines always carry a variant — composite lines are blocked at
 * add-to-cart — so the guard below keeps the invariant honest.
 */
export type CartItemRowLike = Omit<CartItemRow, 'variant'> & {
  variant: CartItemRow['variant'] | null;
};

export function cartItemRows(items: CartItemRowLike[]): CartItemRow[] {
  return items.map((item) => {
    if (!item.variant) {
      throw badRequest('Composite cart lines are not yet supported.');
    }
    return item as CartItemRow;
  });
}

export function toCartItemDto(row: CartItemRowLike): CartItemDto {
  const items = cartItemRows([row]);
  const item = items[0];
  const unitPence = toPence(item.variant.price.toString());
  return {
    id: PrefixedId.format('cartItem', item.id),
    productId: PrefixedId.format('product', item.productId),
    // M3a lines always carry a variant (composite lines are blocked until 3b).
    variantId: PrefixedId.format('variant', item.variantId ?? item.id),
    name: item.variant.product.name,
    slug: item.variant.product.slug,
    variantName: item.variant.name,
    productType: item.variant.product.productType,
    requiresPrescription: item.variant.product.requiresPrescription,
    quantity: item.quantity,
    unitPrice: fromPence(unitPence),
    lineTotal: fromPence(unitPence * item.quantity),
    currency: item.variant.currency,
    petId: item.petId,
    addedAt: item.addedAt.toISOString(),
  };
}

export function toCartDto(
  cart: { id: string; status: string; items: CartItemRowLike[] } | null,
): CartDto {
  if (!cart) {
    return {
      id: null,
      status: 'open',
      itemCount: 0,
      subtotal: '0.00',
      currency: CURRENCY,
      items: [],
    };
  }
  const items = cart.items.map(toCartItemDto);
  const subtotalPence = items.reduce(
    (sum, item) => sum + toPence(item.lineTotal),
    0,
  );
  return {
    id: PrefixedId.format('cart', cart.id),
    status: cart.status,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: fromPence(subtotalPence),
    currency: items[0]?.currency ?? CURRENCY,
    items,
  };
}

export interface OrderRow {
  id: string;
  status: string;
  currency: string;
  subtotal: DecimalLike;
  taxTotal: DecimalLike;
  shippingTotal: DecimalLike;
  grandTotal: DecimalLike;
  fulfilmentMethod: string;
  shippingAddressJson: unknown;
  placedAt: DateLike;
  updatedAt: DateLike;
  items: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    unitPrice: DecimalLike;
    lineTotal: DecimalLike;
    petId: string | null;
    product: { name: string };
  }>;
  fulfilments: Array<{
    id: string;
    method: string;
    status: string;
    carrier: string | null;
    trackingNumber: string | null;
    pickupCode: string | null;
    estimatedReadyAt: DateLike | null;
    completedAt: DateLike | null;
  }>;
  payments: Array<{
    id: string;
    gateway: string;
    status: string;
    amount: DecimalLike;
    currency: string;
    gatewayPaymentRef: string | null;
    failureCode: string | null;
    capturedAt: DateLike | null;
  }>;
}

export function toOrderDto(row: OrderRow): OrderDto {
  const items: OrderItemDto[] = row.items.map((item) => ({
    id: PrefixedId.format('orderItem', item.id),
    productId: PrefixedId.format('product', item.productId),
    variantId: item.variantId
      ? PrefixedId.format('variant', item.variantId)
      : null,
    name: item.product.name,
    quantity: item.quantity,
    unitPrice: fromPence(toPence(item.unitPrice.toString())),
    lineTotal: fromPence(toPence(item.lineTotal.toString())),
    petId: item.petId,
  }));

  const fulfilmentRow = row.fulfilments[0];
  const fulfilment: FulfilmentDto | null = fulfilmentRow
    ? {
        id: PrefixedId.format('fulfilment', fulfilmentRow.id),
        method: fulfilmentRow.method,
        status: fulfilmentRow.status,
        carrier: fulfilmentRow.carrier,
        trackingNumber: fulfilmentRow.trackingNumber,
        pickupCode: fulfilmentRow.pickupCode,
        estimatedReadyAt: fulfilmentRow.estimatedReadyAt
          ? fulfilmentRow.estimatedReadyAt.toISOString()
          : null,
        completedAt: fulfilmentRow.completedAt
          ? fulfilmentRow.completedAt.toISOString()
          : null,
      }
    : null;

  const paymentRow = row.payments[0];
  const payment: PaymentDto | null = paymentRow
    ? {
        id: PrefixedId.format('payment', paymentRow.id),
        gateway: paymentRow.gateway,
        status: paymentRow.status,
        amount: fromPence(toPence(paymentRow.amount.toString())),
        currency: paymentRow.currency,
        gatewayPaymentRef: paymentRow.gatewayPaymentRef,
        failureCode: paymentRow.failureCode,
        capturedAt: paymentRow.capturedAt
          ? paymentRow.capturedAt.toISOString()
          : null,
      }
    : null;

  return {
    id: PrefixedId.format('order', row.id),
    status: row.status,
    currency: row.currency,
    subtotal: fromPence(toPence(row.subtotal.toString())),
    taxTotal: fromPence(toPence(row.taxTotal.toString())),
    shippingTotal: fromPence(toPence(row.shippingTotal.toString())),
    grandTotal: fromPence(toPence(row.grandTotal.toString())),
    fulfilmentMethod: row.fulfilmentMethod,
    shippingAddress:
      (row.shippingAddressJson as ShippingAddressDto | null) ?? null,
    prescriptionStatus: null,
    placedAt: row.placedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items,
    fulfilment,
    payment,
  };
}
