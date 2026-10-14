import { AuthTokensDto, AuthUserDto } from '../dto/auth-response.dto';
import { LoginUserCommand } from '../commands/login-user.command';
import { LogoutUserCommand } from '../commands/logout-user.command';
import { RefreshTokensCommand } from '../commands/refresh-tokens.command';
import { RegisterUserCommand } from '../commands/register-user.command';
import { GetCurrentUserQuery } from '../queries/get-current-user.query';

/**
 * Public API of the Identity context (§6.1). Other modules depend only on this
 * abstract port, bound to the concrete facade with `useExisting` (§3).
 *
 * M2: auth operations (register/login/refresh/logout/me) plus the read
 * methods cross-context consumers need (getUserById, resolveRoles).
 */
export abstract class IdentityFacadePort {
  abstract register(command: RegisterUserCommand): Promise<AuthUserDto>;
  abstract login(command: LoginUserCommand): Promise<AuthTokensDto>;
  abstract refresh(command: RefreshTokensCommand): Promise<AuthTokensDto>;
  abstract logout(command: LogoutUserCommand): Promise<void>;
  abstract getCurrentUser(query: GetCurrentUserQuery): Promise<AuthUserDto>;

  /** Cross-context reads (care-coordination, care-messaging, operations). */
  abstract getUserById(userId: string): Promise<AuthUserDto | null>;
  abstract resolveRoles(userId: string): Promise<string[]>;
}
