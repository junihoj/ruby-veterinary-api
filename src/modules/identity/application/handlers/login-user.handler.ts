import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { HttpException, HttpStatus, Inject } from '@nestjs/common';
import { LoginUserCommand } from '../commands/login-user.command';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { SessionRepository } from '../../infrastructure/repositories/session.repository';
import { Argon2Hasher } from '../../infrastructure/services/argon2-hasher';
import { TokenService } from '../../infrastructure/services/token.service';
import { RefreshTokenService } from '../../infrastructure/services/refresh-token.service';
import { permissionsForRoles } from '../../domain/role-permissions';
import { toAuthUserDto } from '../dto/user.mapper';
import { AuthTokensDto } from '../dto/auth-response.dto';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';

@CommandHandler(LoginUserCommand)
export class LoginUserHandler implements ICommandHandler<LoginUserCommand> {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: Argon2Hasher,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(command: LoginUserCommand): Promise<AuthTokensDto> {
    const user = await this.users.findByEmail(command.email);

    // Uniform failure: unknown email and wrong password share one code so
    // the endpoint does not reveal which part failed.
    if (!user || user.status !== 'active') {
      throw this.invalidCredentials();
    }
    const passwordOk = await this.hasher.verify(
      user.passwordHash,
      command.password,
    );
    if (!passwordOk) {
      throw this.invalidCredentials();
    }

    await this.users.updateLastLogin(user.id);
    return this.issueTokenPair(user, command);
  }

  private invalidCredentials(): HttpException {
    return new HttpException(
      {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  /** Shared pair issuance for login and refresh. */
  async issueTokenPair(
    user: {
      id: string;
      email: string;
      displayName: string | null;
      kind: 'client' | 'staff';
      roles: string[];
    },
    context: { ip?: string; userAgent?: string; deviceLabel?: string },
  ): Promise<AuthTokensDto> {
    const refreshToken = this.refreshTokens.generate();
    const expiresAt = new Date(
      Date.now() + this.config.jwtRefreshTtlSeconds * 1000,
    );

    await this.sessions.create({
      userId: user.id,
      refreshTokenHash: this.refreshTokens.hash(refreshToken),
      deviceLabel: context.deviceLabel,
      ip: context.ip,
      userAgent: context.userAgent,
      expiresAt,
    });

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
}
