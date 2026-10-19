/** Typed infrastructure errors the handlers translate into contract codes. */
export class DuplicateUserLinkError extends Error {
  constructor() {
    super('User already linked to an active client.');
    this.name = 'DuplicateUserLinkError';
  }
}
