/**
 * Deterministic money maths for quotes and orders (api-specification
 * §Catalog & Commerce): `taxTotal` = 20% of subtotal, `shippingTotal` = flat
 * £4.99 for `ship` and 0 for `pickup`/`digital`, `grandTotal` = subtotal +
 * tax + shipping. All arithmetic happens in integer pence — decimal strings
 * in, decimal strings out, no float drift.
 */

export const CURRENCY = 'GBP';
export const VAT_RATE_PERCENT = 20;
export const SHIPPING_FLAT_PENCE = 499;

export type FulfilmentMethod = 'ship' | 'pickup' | 'digital';

/** Decimal string ("45.00") → integer pence, exact. */
export function toPence(amount: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) {
    throw new Error(`Invalid money amount: ${amount}`);
  }
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return Number(match[1]) * 100 + Number(fraction);
}

/** Integer pence → canonical "45.00" decimal string. */
export function fromPence(pence: number): string {
  const rounded = Math.round(pence);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export interface Totals {
  subtotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  currency: string;
}

/** Quote/order totals from per-line totals (already × quantity). */
export function computeTotals(
  lineTotalPence: number[],
  method: FulfilmentMethod,
): Totals {
  const subtotal = lineTotalPence.reduce((sum, p) => sum + p, 0);
  const tax = Math.round((subtotal * VAT_RATE_PERCENT) / 100);
  const shipping = method === 'ship' ? SHIPPING_FLAT_PENCE : 0;
  return {
    subtotal: fromPence(subtotal),
    taxTotal: fromPence(tax),
    shippingTotal: fromPence(shipping),
    grandTotal: fromPence(subtotal + tax + shipping),
    currency: CURRENCY,
  };
}
