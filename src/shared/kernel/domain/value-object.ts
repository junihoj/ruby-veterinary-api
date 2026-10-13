export interface ValueObjectProps {
  [key: string]: unknown;
}

/**
 * Immutable value object. Equality is by structural value, not reference.
 * Subclasses validate in their constructor/factory and throw or return a Result.
 */
export abstract class ValueObject<T extends ValueObjectProps> {
  protected readonly props: T;

  constructor(props: T) {
    this.props = Object.freeze(props);
  }

  equals(vo?: ValueObject<T>): boolean {
    if (vo === undefined || vo === null) return false;
    return JSON.stringify(this.props) === JSON.stringify(vo.props);
  }
}
