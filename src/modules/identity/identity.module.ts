import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { IdentityFacade } from './application/facades/identity-facade';
import { IdentityFacadePort } from './application/facades/identity-facade-port';
import { UserRepository } from './infrastructure/repositories/user.repository';
import { SessionRepository } from './infrastructure/repositories/session.repository';
import { Argon2Hasher } from './infrastructure/services/argon2-hasher';
import { TokenService } from './infrastructure/services/token.service';
import { RefreshTokenService } from './infrastructure/services/refresh-token.service';
import { RegisterUserHandler } from './application/handlers/register-user.handler';
import { LoginUserHandler } from './application/handlers/login-user.handler';
import { RefreshTokensHandler } from './application/handlers/refresh-tokens.handler';
import { LogoutUserHandler } from './application/handlers/logout-user.handler';
import { GetCurrentUserHandler } from './application/handlers/get-current-user.handler';
import { AuthController } from './presentation/auth.controller';

/**
 * Identity bounded context (schema: identity) — M2: auth operations
 * (register/login/refresh/logout/me) with rotating refresh tokens (ADR-0011).
 */
@Module({
  imports: [CqrsModule],
  controllers: [AuthController],
  providers: [
    IdentityFacade,
    { provide: IdentityFacadePort, useExisting: IdentityFacade },
    UserRepository,
    SessionRepository,
    Argon2Hasher,
    TokenService,
    RefreshTokenService,
    RegisterUserHandler,
    LoginUserHandler,
    RefreshTokensHandler,
    LogoutUserHandler,
    GetCurrentUserHandler,
  ],
  exports: [IdentityFacadePort],
})
export class IdentityModule {}
