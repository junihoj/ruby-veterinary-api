export class LogoutUserCommand {
  constructor(public readonly refreshToken: string) {}
}
