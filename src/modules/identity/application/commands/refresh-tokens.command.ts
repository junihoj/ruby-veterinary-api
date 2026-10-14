export class RefreshTokensCommand {
  constructor(
    public readonly refreshToken: string,
    public readonly ip?: string,
    public readonly userAgent?: string,
    public readonly deviceLabel?: string,
  ) {}
}
