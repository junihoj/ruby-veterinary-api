import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDecimal,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Commerce request bodies (commerce.yaml M3a). The global ValidationPipe
 * whitelists strictly: unknown fields are 400 VALIDATION_FAILED.
 */

export const FULFILMENT_METHODS = ['ship', 'pickup', 'digital'] as const;
export type FulfilmentMethodInput = (typeof FULFILMENT_METHODS)[number];

export const PRODUCT_TYPES = [
  'simple',
  'variable',
  'grouped',
  'external',
  'composite',
] as const;
export type ProductTypeInput = (typeof PRODUCT_TYPES)[number];

export class ComponentSelectionDto {
  @IsString()
  slotId: string;

  @IsString()
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

/** POST /cart/items — composite components are rejected in M3a (see handler). */
export class AddCartItemDto {
  @IsString()
  variantId: string;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;

  @IsOptional()
  @IsString()
  petId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComponentSelectionDto)
  components?: ComponentSelectionDto[];
}

/** PATCH /cart/items?itemId= — quantity 0 removes the line. */
export class UpdateCartItemDto {
  @IsInt()
  @Min(0)
  @Max(999)
  quantity: number;
}

export class ShippingAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  country?: string;
}

/** POST /checkout/quote — method defaults to ship when omitted. */
export class QuoteRequestDto {
  @IsOptional()
  @IsIn(FULFILMENT_METHODS)
  fulfilmentMethod?: FulfilmentMethodInput;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;
}

/** POST /checkout — card data never accepted here (ADR-0007). */
export class CheckoutRequestDto {
  @IsIn(FULFILMENT_METHODS)
  fulfilmentMethod: FulfilmentMethodInput;

  @IsOptional()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress?: ShippingAddressDto;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentMethodToken?: string;
}

/** POST /admin/products — creates a draft product of one of seven shapes. */
export class AdminCreateProductDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case.',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsString()
  categoryId: string;

  @IsIn(PRODUCT_TYPES)
  productType: ProductTypeInput;

  @IsOptional()
  @IsBoolean()
  isVirtual?: boolean;

  @IsOptional()
  @IsBoolean()
  isDownloadable?: boolean;

  @IsOptional()
  @IsIn(['fixed', 'sum'])
  pricingMode?: 'fixed' | 'sum';

  @IsOptional()
  @IsUrl({ require_protocol: true })
  externalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  buttonText?: string;

  @IsOptional()
  @IsBoolean()
  requiresPrescription?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresPetClaim?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionMd?: string;
}

/**
 * PATCH /admin/products/{id} — partial product update, or a variant update
 * when `variantId` targets one of this product's variants (stock/price
 * maintenance; variant *creation* is not part of the contract surface yet).
 */
export class AdminUpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case.',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  productType?: ProductTypeInput;

  @IsOptional()
  @IsBoolean()
  isVirtual?: boolean;

  @IsOptional()
  @IsBoolean()
  isDownloadable?: boolean;

  @IsOptional()
  @IsIn(['fixed', 'sum'])
  pricingMode?: 'fixed' | 'sum';

  @IsOptional()
  @IsUrl({ require_protocol: true })
  externalUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  buttonText?: string;

  @IsOptional()
  @IsBoolean()
  requiresPrescription?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresPetClaim?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionMd?: string;

  // ---- variant maintenance (applied when variantId is present) ----

  @IsOptional()
  @IsString()
  variantId?: string;

  @IsOptional()
  @IsDecimal()
  price?: string;

  @IsOptional()
  @IsDecimal()
  compareAtPrice?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  variantName?: string;

  @IsOptional()
  @IsBoolean()
  variantActive?: boolean;
}
