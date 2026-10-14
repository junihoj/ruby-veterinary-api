import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Argon2id password hashing (identity). Parameters follow OWASP guidance
 * for a single-VPS deployment: interactive cost, no parallelism beyond
 * what one VPS can absorb.
 */
@Injectable()
export class Argon2Hasher {
  private readonly options: Parameters<typeof argon2.hash>[1] = {
    type: argon2.argon2id,
    memoryCost: 19456, // 19 MB
    timeCost: 2,
    parallelism: 1,
  };

  hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, this.options).then((h) => h.toString());
  }

  async verify(hash: string, plaintext: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plaintext);
    } catch {
      // A malformed stored hash (e.g. a placeholder seed value) must fail
      // closed as "wrong password", never surface as a 500.
      return false;
    }
  }
}
