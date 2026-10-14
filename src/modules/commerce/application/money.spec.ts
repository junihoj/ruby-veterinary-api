import {
  computeTotals,
  fromPence,
  SHIPPING_FLAT_PENCE,
  toPence,
} from './money';

describe('commerce/money (deterministic totals)', () => {
  describe('toPence', () => {
    it('parses canonical decimals exactly', () => {
      expect(toPence('45.00')).toBe(4500);
      expect(toPence('0.05')).toBe(5);
      expect(toPence('12.3')).toBe(1230);
      expect(toPence('999')).toBe(99900);
    });

    it('rejects malformed amounts', () => {
      expect(() => toPence('12.345')).toThrow('Invalid money amount');
      expect(() => toPence('-1.00')).toThrow('Invalid money amount');
      expect(() => toPence('abc')).toThrow('Invalid money amount');
    });
  });

  describe('fromPence', () => {
    it('formats pence as two-decimal strings', () => {
      expect(fromPence(4500)).toBe('45.00');
      expect(fromPence(5)).toBe('0.05');
      expect(fromPence(0)).toBe('0.00');
    });
  });

  describe('computeTotals', () => {
    it('adds 20% VAT on top of the subtotal', () => {
      const totals = computeTotals([1000], 'pickup'); // £10.00
      expect(totals.subtotal).toBe('10.00');
      expect(totals.taxTotal).toBe('2.00');
      expect(totals.shippingTotal).toBe('0.00');
      expect(totals.grandTotal).toBe('12.00');
      expect(totals.currency).toBe('GBP');
    });

    it('charges flat shipping only for ship', () => {
      expect(computeTotals([1000], 'ship').shippingTotal).toBe('4.99');
      expect(computeTotals([1000], 'pickup').shippingTotal).toBe('0.00');
      expect(computeTotals([1000], 'digital').shippingTotal).toBe('0.00');
      expect(SHIPPING_FLAT_PENCE).toBe(499);
    });

    it('sums multiple lines before taxing', () => {
      // £12.50 + 2 × £32.00 = £76.50; VAT £15.30; ship £4.99 → £96.79
      const totals = computeTotals([1250, 6400], 'ship');
      expect(totals.subtotal).toBe('76.50');
      expect(totals.taxTotal).toBe('15.30');
      expect(totals.shippingTotal).toBe('4.99');
      expect(totals.grandTotal).toBe('96.79');
    });

    it('rounds half-up on odd pennies', () => {
      // £0.05 VAT on £0.25 subtotal rounds to £0.05
      const totals = computeTotals([25], 'pickup');
      expect(totals.taxTotal).toBe('0.05');
      expect(totals.grandTotal).toBe('0.30');
    });

    it('totals an empty cart to zero', () => {
      const totals = computeTotals([], 'digital');
      expect(totals).toEqual({
        subtotal: '0.00',
        taxTotal: '0.00',
        shippingTotal: '0.00',
        grandTotal: '0.00',
        currency: 'GBP',
      });
    });
  });
});
