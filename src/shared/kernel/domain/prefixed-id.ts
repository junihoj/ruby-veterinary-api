import { randomUUID } from 'node:crypto';

/**
 * Entity prefix → short code. The database column stays a bare UUID; the API
 * serialises it as `<prefix>_<uuid>` (e.g. `ord_9f2c...`). Prefixes are stable
 * API surface (api-specification.md §Identifiers), so names are added here and
 * never repurposed. The full catalogue grows as each context lands; the codes
 * named in the spec today are `apt_`, `ord_`, `pet_`, `rx_`, `req_`.
 */
export const ENTITY_PREFIXES = {
  user: 'usr',
  role: 'rol',
  session: 'ses',
  staffMembership: 'stm',
  clinic: 'cln',
  service: 'srv',
  staffProfile: 'stf',
  informationPage: 'inf',
  document: 'doc',
  article: 'art',
  category: 'cat',
  tag: 'tag',
  appointmentRequest: 'apt',
  intakeSubmission: 'int',
  historyUpload: 'upl',
  client: 'cli',
  pet: 'pet',
  medicalHistoryRecord: 'mhr',
  product: 'prd',
  variant: 'var',
  productCategory: 'pcat',
  cart: 'car',
  cartItem: 'cit',
  order: 'ord',
  orderItem: 'oit',
  fulfilment: 'ful',
  payment: 'pay',
  subscription: 'sub',
  prescriptionRequest: 'rx',
  prescriptionDecision: 'rxd',
  conversation: 'cvn',
  inboxMessage: 'msg',
  notification: 'ntf',
  auditLog: 'aud',
} as const;

export type EntityName = keyof typeof ENTITY_PREFIXES;

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PrefixedId {
  /** New prefixed id backed by a fresh UUID. */
  static newId(entity: EntityName): string {
    return PrefixedId.format(entity, randomUUID());
  }

  /** Attach a known UUID to its entity prefix. */
  static format(entity: EntityName, uuid: string): string {
    if (!UUID_RE.test(uuid)) {
      throw new Error(`PrefixedId.format: not a UUID: ${uuid}`);
    }
    return `${ENTITY_PREFIXES[entity]}_${uuid.toLowerCase()}`;
  }

  /** Parse a prefixed id back to its bare UUID for database use. */
  static toUuid(prefixed: string): string {
    const uuid = PrefixedId.tryToUuid(prefixed);
    if (uuid === null) {
      throw new Error(`PrefixedId: malformed identifier: ${prefixed}`);
    }
    return uuid;
  }

  /** Non-throwing parse; null when the shape is wrong. */
  static tryToUuid(prefixed: string): string | null {
    const idx = prefixed.indexOf('_');
    if (idx <= 0) return null;
    const uuid = prefixed.slice(idx + 1);
    return UUID_RE.test(uuid) ? uuid.toLowerCase() : null;
  }

  /** True when the id carries the expected entity's prefix. */
  static isEntity(prefixed: string, entity: EntityName): boolean {
    return prefixed.startsWith(`${ENTITY_PREFIXES[entity]}_`);
  }
}
