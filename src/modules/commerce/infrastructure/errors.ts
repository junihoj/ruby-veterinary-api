/**
 * Commerce domain errors that cross the handler boundary before being mapped
 * to contract error codes (api-specification §Error Model).
 */

/** Available stock dropped since quote → handler answers 409 STOCK_CHANGED. */
export class StockConflictError extends Error {
  constructor() {
    super('Insufficient available stock for one or more lines.');
    this.name = 'StockConflictError';
  }
}

/**
 * A concurrent request with the same Idempotency-Key won the unique-constraint
 * race on `orders.idempotency_key` — the handler replays that original order
 * instead of double-ordering (retries never double-charge).
 */
export class DuplicateOrderKeyError extends Error {
  constructor() {
    super('Order with this idempotency key already exists.');
    this.name = 'DuplicateOrderKeyError';
  }
}
