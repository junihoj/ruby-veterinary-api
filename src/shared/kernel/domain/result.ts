/**
 * Result type for validation paths that should not throw (§4.1).
 * VOs use `static create(): Result<T, string>` and the handler converts an
 * `err` into a BadRequestException at the edge.
 */
export type Result<T, E = string> = Ok<T, E> | Err<T, E>;

export class Ok<T, E = string> {
  readonly ok = true as const;
  constructor(readonly value: T) {}

  unwrap(): T {
    return this.value;
  }

  isOk(): this is Ok<T, E> {
    return true;
  }

  isErr(): this is Err<T, E> {
    return false;
  }
}

export class Err<T, E = string> {
  readonly ok = false as const;
  constructor(readonly error: E) {}

  unwrap(): T {
    throw new Error(`Result is an error: ${String(this.error)}`);
  }

  isOk(): this is Ok<T, E> {
    return false;
  }

  isErr(): this is Err<T, E> {
    return true;
  }
}

export function ok<T, E = string>(value: T): Result<T, E> {
  return new Ok<T, E>(value);
}

export function err<T, E = string>(error: E): Result<T, E> {
  return new Err<T, E>(error);
}
