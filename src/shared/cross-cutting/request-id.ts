import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Per-request correlation id (§9). Generated when absent so inbound requests
 * can be traced end-to-end; surfaced in logs and both response envelopes.
 */
export function resolveRequestId(incoming?: string): string {
  if (incoming && incoming.trim().length > 0 && incoming.length <= 128) {
    return incoming.trim();
  }
  return randomUUID();
}
