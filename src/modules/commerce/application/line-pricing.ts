import { toPence } from './money';
import { badRequest } from './errors';
import type { CartComponentRow, CartItemRow } from './dto/commerce.mapper';

/**
 * Per-line unit pricing (commerce.md: "prices are re-read from
 * product_variants at quote/checkout; the cart stores no price snapshot").
 *
 * - Plain lines: the variant's price.
 * - Fixed-priced composite: the parent default variant's price — components
 *   drive the pick list and stock, not the price.
 * - Sum-priced composite: Σ per selected option of
 *   (`price_override` when the slot option sets one, else the pinned
 *   component variant's price) × component quantity.
 *
 * The priceOverride lookup matches the slot option by (product, pinned
 * variant); an unpinned option (componentVariantId null) matches any
 * variant of its candidate product.
 */
/** One component's unit price in pence (option price_override wins). */
export function componentUnitPence(component: CartComponentRow): number {
  const option = component.slot.options.find(
    (candidate) =>
      candidate.productId === component.productId &&
      (candidate.componentVariantId === null ||
        candidate.componentVariantId === component.variantId),
  );
  return option?.priceOverride != null
    ? toPence(option.priceOverride.toString())
    : toPence(component.variant.price.toString());
}

export function lineUnitPence(item: CartItemRow): number {
  if (item.variant) return toPence(item.variant.price.toString());
  if (item.components.length > 0) {
    return item.components.reduce(
      (sum, component) =>
        sum + componentUnitPence(component) * component.quantity,
      0,
    );
  }
  // Neither a variant nor components: only reachable if slot rows were
  // removed under a live sum line — treat as a client-visible 400.
  throw badRequest('This cart line can no longer be priced.');
}
