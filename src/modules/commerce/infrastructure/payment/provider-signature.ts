import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * `X-Provider-Signature` verification (webhooks.yaml; api-specification
 * §Payments Webhooks): hex HMAC-SHA256 of the RAW request body under the
 * shared provider secret, compared in constant time. Fails closed on any
 * missing input — an unset `PAYMENT_WEBHOOK_SECRET` answers 401 for every
 * delivery rather than silently accepting one.
 */
export function verifyProviderSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  secret: string | undefined,
): boolean {
  if (!rawBody || !rawBody.length || !signatureHeader || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signatureHeader, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** HMAC helper for the mock provider and the e2e suite (never production). */
export function signProviderPayload(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function sha256Hex(payload: Buffer | string): string {
  return createHash('sha256').update(payload).digest('hex');
}
