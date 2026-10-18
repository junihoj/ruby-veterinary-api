import type { CartComponentRow, CartItemRow } from './dto/commerce.mapper';
import { componentUnitPence, lineUnitPence } from './line-pricing';

/**
 * Both composite pricing modes (commerce.md composite pricing, M3b):
 * fixed = parent default variant price; sum = Σ (price_override when the
 * slot option sets one, else the pinned component variant's price) ×
 * component quantity.
 */

function component(
  overrides: Partial<CartComponentRow> = {},
): CartComponentRow {
  return {
    slotId: 'csl_00000000-0000-4000-8000-000000000001',
    productId: 'prd_00000000-0000-4000-8000-000000000001',
    variantId: 'var_00000000-0000-4000-8000-000000000001',
    quantity: 1,
    variant: {
      name: 'Default',
      price: { toString: () => '5.00' },
      currency: 'GBP',
    },
    product: {
      name: 'Care Video Pack',
      slug: 'care-video-pack',
      requiresPrescription: false,
      isVirtual: true,
      isDownloadable: true,
    },
    slot: { options: [] },
    ...overrides,
  };
}

function item(overrides: Partial<CartItemRow> = {}): CartItemRow {
  return {
    id: 'cit_00000000-0000-4000-8000-000000000001',
    productId: 'prd_00000000-0000-4000-8000-000000000009',
    variantId: 'var_00000000-0000-4000-8000-000000000009',
    quantity: 1,
    petId: null,
    addedAt: { toISOString: () => '2026-01-01T00:00:00.000Z' },
    variant: {
      name: 'Single pack',
      price: { toString: () => '12.50' },
      currency: 'GBP',
    },
    product: {
      name: 'Flea & Tick Spot-On',
      slug: 'flea-tick-spot-on',
      productType: 'simple',
      pricingMode: null,
      requiresPrescription: false,
      isVirtual: false,
      isDownloadable: false,
    },
    components: [],
    ...overrides,
  };
}

describe('commerce/line-pricing (M3b composite modes)', () => {
  it('prices a plain line from its variant', () => {
    expect(lineUnitPence(item())).toBe(1250);
  });

  it('prices a fixed composite from the parent default variant, ignoring components', () => {
    const fixedComposite = item({
      variantId: 'var_00000000-0000-4000-8000-000000000007',
      variant: {
        name: 'Monthly box',
        price: { toString: () => '27.00' },
        currency: 'GBP',
      },
      product: {
        name: 'Monthly Wellness Box',
        slug: 'wellness-box',
        productType: 'composite',
        pricingMode: 'fixed',
        requiresPrescription: false,
        isVirtual: false,
        isDownloadable: false,
      },
      components: [
        component({
          quantity: 2,
          variant: {
            name: '30 chews',
            price: { toString: () => '9.00' },
            currency: 'GBP',
          },
        }),
      ],
    });
    expect(lineUnitPence(fixedComposite)).toBe(2700);
  });

  it('prices a sum composite as Σ override/variant price × component quantity', () => {
    const guide = component({
      productId: 'prd_00000000-0000-4000-8000-000000000002',
      variantId: 'var_00000000-0000-4000-8000-000000000002',
      quantity: 1,
      variant: {
        name: 'Guide',
        price: { toString: () => '8.00' },
        currency: 'GBP',
      },
      slot: {
        options: [
          {
            productId: 'prd_00000000-0000-4000-8000-000000000002',
            componentVariantId: 'var_00000000-0000-4000-8000-000000000002',
            // The slot underprices the guide.
            priceOverride: { toString: () => '3.00' },
          },
        ],
      },
    });
    const videos = component({
      productId: 'prd_00000000-0000-4000-8000-000000000003',
      variantId: 'var_00000000-0000-4000-8000-000000000003',
      quantity: 2,
    });
    const sumComposite = item({
      variantId: null,
      variant: null,
      product: {
        name: 'Pet Care Kit',
        slug: 'pet-care-kit',
        productType: 'composite',
        pricingMode: 'sum',
        requiresPrescription: false,
        isVirtual: false,
        isDownloadable: false,
      },
      components: [guide, videos],
    });
    // 3.00 (override) + 5.00 (variant) × 2 = 13.00
    expect(lineUnitPence(sumComposite)).toBe(1300);
  });

  it('matches an unpinned option override to any variant of its product', () => {
    const withOverride = component({
      slot: {
        options: [
          {
            productId: 'prd_00000000-0000-4000-8000-000000000001',
            componentVariantId: null,
            priceOverride: { toString: () => '4.25' },
          },
        ],
      },
    });
    expect(componentUnitPence(withOverride)).toBe(425);
  });

  it('falls back to the variant price when no override applies', () => {
    const pinnedElsewhere = component({
      slot: {
        options: [
          {
            productId: 'prd_00000000-0000-4000-8000-000000000001',
            componentVariantId: 'var_00000000-0000-4000-8000-000000000099',
            priceOverride: { toString: () => '1.00' },
          },
        ],
      },
    });
    expect(componentUnitPence(pinnedElsewhere)).toBe(500);
  });

  it('answers 400 for a line with neither variant nor components', () => {
    expect(() =>
      lineUnitPence(item({ variantId: null, variant: null })),
    ).toThrow('can no longer be priced');
  });
});
