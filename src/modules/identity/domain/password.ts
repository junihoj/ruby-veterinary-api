/**
 * Password value object (identity). Enforces the API minimum length
 * (auth.yaml: minLength 10). Hashing lives in Argon2Hasher — this VO only
 * guards the plaintext contract.
 */
export class Password {
  private constructor(private readonly value: string) {}

  static create(raw: string): Password {
    if (raw.length < 10) {
      throw new Error('Password must be at least 10 characters.');
    }
    return new Password(raw);
  }

  toString(): string {
    return this.value;
  }
}
