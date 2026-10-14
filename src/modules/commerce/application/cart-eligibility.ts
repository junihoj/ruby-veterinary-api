import { badRequest, prescriptionPending } from './errors';
import type { CartItemRow } from './dto/commerce.mapper';
import type { FulfilmentMethod } from './money';

/**
 * Cart eligibility rules shared by quote and checkout (commerce.yaml):
 * prescription lines are held until the pharmacy releases them (422
 * PRESCRIPTION_PENDING — temporary while Rx lines are blocked, Phase 5),
 * digital fulfilment requires every line virtual/downloadable, and M3a lines
 * must always carry a variant (composite lines are M3b).
 */
export function assertCartLinesEligible(
  items: CartItemRow[],
  method: FulfilmentMethod,
): void {
  for (const item of items) {
    if (item.variant.product.requiresPrescription) {
      throw prescriptionPending(
        'Prescription items are held for veterinary authorisation before checkout.',
      );
    }
    if (!item.variantId) {
      throw badRequest('Composite cart lines are not yet supported.');
    }
  }

  if (method === 'digital') {
    const physical = items.find(
      (item) =>
        !item.variant.product.isVirtual && !item.variant.product.isDownloadable,
    );
    if (physical) {
      throw badRequest(
        'Digital fulfilment is available only when every item in the cart is virtual or downloadable.',
      );
    }
  }
}
