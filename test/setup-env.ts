/**
 * Runs before any test file is required (jest `setupFiles`), i.e. before
 * `import 'dotenv/config'` loads `.env`. dotenv never overrides values that
 * are already set, so pinning the in-process timers to 0 here guarantees
 * background ticks never race e2e assertions (tests drive the workers
 * explicitly).
 */
process.env.SUBSCRIPTIONS_TICK_MS = '0';
process.env.CHAT_SWEEPER_TICK_MS = '0';
process.env.AI_INGESTION_TICK_MS = '0';
