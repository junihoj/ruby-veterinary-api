export class LoginUserCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly ip?: string,
    public readonly userAgent?: string,
    public readonly deviceLabel?: string,
  ) {}
}
