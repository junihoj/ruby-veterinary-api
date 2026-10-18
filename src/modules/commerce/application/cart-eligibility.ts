import { badRequest, prescriptionPending } from './errors';
import type { CartItemRow } from './dto/commerce.mapper';
import type { FulfilmentMethod } from './money';

/**
 * Cart eligibility rules shared by quote and checkout (commerce.yaml):
 *
 * - Prescription lines are held until the pharmacy releases them (422
 *   PRESCRIPTION_PENDING — temporary while Rx lines are blocked, M5).
 * - Digital fulfilment requires every line to be virtual or downloadable.
 *   For composite lines that flag is *derived from the selection* (M3b): the
 *   line qualifies only when every selected component product is itself
 *   virtual or downloadable — the composite's own flags say nothing about
 *   what's in the box.
 */
export function assertCartLinesEligible(
  items: CartItemRow[],
  method: FulfilmentMethod,
): void {
  for (const item of items) {
    if (item.product.requiresPrescription) {
      throw prescriptionPending(
        'Prescription items are held for veterinary authorisation before checkout.',
      );
    }
  }

  if (method === 'digital') {
    const physical = items.find((item) => !isDigitalLine(item));
    if (physical) {
      throw badRequest(
        'Digital fulfilment is available only when every item in the cart is virtual or downloadable.',
      );
    }
  }
}

/** A line qualifies for digital fulfilment purely from its (derived) flags. */
export function isDigitalLine(item: CartItemRow): boolean {
  if (item.product.productType === 'composite') {
    return (
      item.components.length > 0 &&
      item.components.every(
        (component) =>
          component.product.isVirtual || component.product.isDownloadable,
      )
    );
  }
  return item.product.isVirtual || item.product.isDownloadable;
}

/** True when every line in the cart is digital (auto-completes at capture). */
export function isFullyDigitalCart(items: CartItemRow[]): boolean {
  return items.length > 0 && items.every(isDigitalLine);
}
