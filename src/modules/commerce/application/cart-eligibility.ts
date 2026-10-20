import { badRequest, prescriptionPending } from './errors';
import type { CartItemRow } from './dto/commerce.mapper';
import type { FulfilmentMethod } from './money';

/**
 * Cart eligibility rules shared by quote and checkout (commerce.yaml):
 *
 * - Prescription lines flow through since M5 (the pharmacy hold engages at
 *   checkout, Flow 4), but every Rx line must carry a pet — enforced at
 *   add-to-cart and re-checked here as defence: a line whose Rx details
 *   never arrived answers 422 PRESCRIPTION_PENDING instead of silently
 *   skipping authorisation.
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
    if (cartLineRequiresPrescription(item) && !item.petId) {
      throw prescriptionPending(
        'Prescription items need the pet they are for before checkout.',
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

/**
 * Whether a line needs prescription authorisation (M3b derived flags): the
 * line's own product flag OR any selected component product's flag — a
 * composite with an Rx component is an Rx line.
 */
export function cartLineRequiresPrescription(item: CartItemRow): boolean {
  if (item.product.requiresPrescription) return true;
  return item.components.some(
    (component) => component.product.requiresPrescription,
  );
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
