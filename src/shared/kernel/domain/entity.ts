/**
 * Identity-bearing base for domain entities. The id is a prefixed opaque string
 * at the API boundary (see PrefixedId); the database stores a bare UUID.
 */
export abstract class Entity<T> {
  protected readonly _id: string;
  protected readonly props: T;

  constructor(id: string, props: T) {
    this._id = id;
    this.props = props;
  }

  get id(): string {
    return this._id;
  }

  equals(other?: Entity<T>): boolean {
    if (other === undefined || other === null) return false;
    return this._id === other._id;
  }
}
