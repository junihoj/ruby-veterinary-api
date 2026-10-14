/** DELETE /cart — remove every line from the caller's open cart. */
export class ClearCartCommand {
  constructor(public readonly userId: string) {}
}
