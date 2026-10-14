import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { LogoutUserCommand } from '../commands/logout-user.command';
import { SessionRepository } from '../../infrastructure/repositories/session.repository';
import { RefreshTokenService } from '../../infrastructure/services/refresh-token.service';

@CommandHandler(LogoutUserCommand)
export class LogoutUserHandler implements ICommandHandler<LogoutUserCommand> {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async execute(command: LogoutUserCommand): Promise<void> {
    const hash = this.refreshTokens.hash(command.refreshToken);
    const session = await this.sessions.findByTokenHash(hash);
    // Idempotent: an unknown or already-revoked token still returns 204.
    if (session && session.revokedAt === null) {
      await this.sessions.revoke(session.id);
    }
  }
}
