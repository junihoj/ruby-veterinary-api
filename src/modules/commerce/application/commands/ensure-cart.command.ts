/** POST /cart — ensure the caller has an open cart (idempotent). */
export class EnsureCartCommand {
  constructor(public readonly userId: string) {}
}
