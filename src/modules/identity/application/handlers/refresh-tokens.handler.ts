import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpException, HttpStatus, Inject } from '@nestjs/common';
import { RefreshTokensCommand } from '../commands/refresh-tokens.command';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { SessionRepository } from '../../infrastructure/repositories/session.repository';
import { TokenService } from '../../infrastructure/services/token.service';
import { RefreshTokenService } from '../../infrastructure/services/refresh-token.service';
import { permissionsForRoles } from '../../domain/role-permissions';
import { toAuthUserDto } from '../dto/user.mapper';
import { AuthTokensDto } from '../dto/auth-response.dto';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';

@CommandHandler(RefreshTokensCommand)
export class RefreshTokensHandler implements ICommandHandler<RefreshTokensCommand> {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(command: RefreshTokensCommand): Promise<AuthTokensDto> {
    const hash = this.refreshTokens.hash(command.refreshToken);
    const session = await this.sessions.findByTokenHash(hash);

    if (!session) {
      throw this.unauthorized('INVALID_CREDENTIALS', 'Invalid refresh token.');
    }

    // Reuse of a rotated/revoked token = compromise: revoke every session
    // of the user and fail (data-model/identity.md rotation semantics).
    if (session.revokedAt !== null) {
      await this.sessions.revokeAllForUser(session.userId);
      throw this.unauthorized(
        'INVALID_CREDENTIALS',
        'Refresh token has already been used.',
      );
    }

    if (session.expiresAt <= new Date()) {
      throw this.unauthorized('TOKEN_EXPIRED', 'Refresh token has expired.');
    }

    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'active') {
      throw this.unauthorized('INVALID_CREDENTIALS', 'Account is not active.');
    }

    // Rotate: new session row, previous revoked atomically.
    const refreshToken = this.refreshTokens.generate();
    const expiresAt = new Date(
      Date.now() + this.config.jwtRefreshTtlSeconds * 1000,
    );

    await this.sessions.create({
      userId: user.id,
      refreshTokenHash: this.refreshTokens.hash(refreshToken),
      deviceLabel: command.deviceLabel,
      ip: command.ip,
      userAgent: command.userAgent,
      expiresAt,
    });
    await this.sessions.revoke(session.id);

    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      kind: user.kind,
      roles: user.roles,
      permissions: permissionsForRoles(user.roles),
    });

    return {
      tokens: {
        accessToken: accessToken.token,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: accessToken.expiresIn,
      },
      user: toAuthUserDto(user),
    };
  }

  private unauthorized(code: string, message: string): HttpException {
    return new HttpException({ code, message }, HttpStatus.UNAUTHORIZED);
  }
}
