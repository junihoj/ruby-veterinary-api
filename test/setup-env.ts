/**
 * Runs before any test file is required (jest `setupFiles`), i.e. before
 * `import 'dotenv/config'` loads `.env`. dotenv never overrides values that
 * are already set, so pinning the subscription timer to 0 here guarantees
 * the in-process auto-refill tick never races e2e assertions.
 */
process.env.SUBSCRIPTIONS_TICK_MS = '0';
