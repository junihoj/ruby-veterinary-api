import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENCY_SCOPE_KEY = 'idempotencyScope';

/**
 * Route-scoped idempotency namespace (M4 care forms reuse the M3a
 * interceptor). Keys never collide across routes or accounts: the stored
 * scope is `<name>:<userId ?? 'anonymous'>`, so an anonymous form's key is
 * global per route (keys are client-generated UUIDs — cross-visitor
 * collisions are negligible).
 */
export const Idempotent = (scope: string) =>
  SetMetadata(IDEMPOTENCY_SCOPE_KEY, scope);
