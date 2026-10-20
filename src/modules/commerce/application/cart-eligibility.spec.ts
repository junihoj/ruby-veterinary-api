import { HttpException } from '@nestjs/common';
import type { CartItemRow } from './dto/commerce.mapper';
import {
  assertCartLinesEligible,
  cartLineRequiresPrescription,
} from './cart-eligibility';

const PET_ID = '9c1e2d3a-1111-4222-8333-444455556666';

function line(overrides: {
  requiresPrescription?: boolean;
  petId?: string | null;
  components?: Array<{ product: { requiresPrescription: boolean } }>;
}): CartItemRow {
  return {
    id: '2f6f5f9a-1111-4222-8333-444455556666',
    productId: '3a7a6a9b-1111-4222-8333-444455556666',
    variantId: '4b8b7b9c-1111-4222-8333-444455556666',
    quantity: 1,
    petId: overrides.petId ?? null,
    addedAt: new Date('2026-01-01T00:00:00Z'),
    variant: {
      name: 'v',
      price: { toString: () => '10.00' },
      currency: 'GBP',
    },
    product: {
      name: 'p',
      slug: 'p',
      productType: 'simple',
      pricingMode: null,
      requiresPrescription: overrides.requiresPrescription ?? false,
      isVirtual: false,
      isDownloadable: false,
    },
    components: (overrides.components ?? []) as CartItemRow['components'],
  };
}

describe('commerce/cart-eligibility (M5 Rx rules)', () => {
  it('derives the Rx flag from any selected component (M3b OR)', () => {
    expect(cartLineRequiresPrescription(line({}))).toBe(false);
    expect(
      cartLineRequiresPrescription(
        line({ requiresPrescription: true, petId: PET_ID }),
      ),
    ).toBe(true);
    expect(
      cartLineRequiresPrescription(
        line({
          components: [
            { product: { requiresPrescription: false } },
            { product: { requiresPrescription: true } },
          ] as never,
        }),
      ),
    ).toBe(true);
  });

  it('lets a pet-carrying Rx line through (the hold engages at checkout)', () => {
    expect(() =>
      assertCartLinesEligible(
        [line({ requiresPrescription: true, petId: PET_ID })],
        'ship',
      ),
    ).not.toThrow();
  });

  it('defends with 422 PRESCRIPTION_PENDING when an Rx line lost its pet', () => {
    try {
      assertCartLinesEligible([line({ requiresPrescription: true })], 'ship');
      throw new Error('expected the guard to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const http = error as HttpException;
      expect(http.getStatus()).toBe(422);
      expect(http.getResponse()).toMatchObject({
        code: 'PRESCRIPTION_PENDING',
      });
    }
  });
});
