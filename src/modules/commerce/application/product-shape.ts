import { badRequest } from './errors';
import type { ProductTypeInput } from './dto/commerce.requests.dto';

/**
 * Shape-specific field invariants (commerce.md products): external products
 * carry an outbound URL + button, composites carry a pricing mode, and
 * neither field applies to any other shape. Enforced on create and on the
 * merged result of every partial update.
 */
export function assertShapeInvariants(
  productType: ProductTypeInput,
  externalUrl: string | null | undefined,
  pricingMode: string | null | undefined,
): void {
  if (productType === 'external' && !externalUrl) {
    throw badRequest('External products require externalUrl.');
  }
  if (productType !== 'external' && externalUrl) {
    throw badRequest('externalUrl applies to external products only.');
  }
  if (productType === 'composite' && !pricingMode) {
    throw badRequest('Composite products require pricingMode.');
  }
  if (productType !== 'composite' && pricingMode) {
    throw badRequest('pricingMode applies to composite products only.');
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
