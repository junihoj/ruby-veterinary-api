import { createHash, randomBytes } from 'node:crypto';

/**
 * Refresh-token service (identity, ADR-0011). Tokens are 64 random bytes,
 * base64url-encoded for the wire; only their SHA-256 hash is persisted
 * (sessions.refresh_token_hash), so a database leak does not expose live
 * tokens.
 */
export class RefreshTokenService {
  /** New opaque refresh token for the response body. */
  generate(): string {
    return randomBytes(64).toString('base64url');
  }

  /** SHA-256 hex of a token — the value stored in the database. */
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
