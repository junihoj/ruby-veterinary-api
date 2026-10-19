/**
 * Anonymous intake form budget (api-architecture §9): 5 submissions per 10
 * minutes per route per IP. Shared by the two owner-facing form routes;
 * e2e suites must stay within it.
 */
export const FORM_THROTTLE = {
  default: { limit: 5, ttl: 600_000 },
} as const;
