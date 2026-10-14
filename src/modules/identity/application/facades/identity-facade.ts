import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IdentityFacadePort } from './identity-facade-port';
import { AuthTokensDto, AuthUserDto } from '../dto/auth-response.dto';
import { LoginUserCommand } from '../commands/login-user.command';
import { LogoutUserCommand } from '../commands/logout-user.command';
import { RefreshTokensCommand } from '../commands/refresh-tokens.command';
import { RegisterUserCommand } from '../commands/register-user.command';
import { GetCurrentUserQuery } from '../queries/get-current-user.query';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { toAuthUserDto } from '../dto/user.mapper';

/**
 * Identity facade (§3): thin delegation to the CQRS buses. Handlers own the
 * behaviour; cross-context consumers see only this port.
 */
@Injectable()
export class IdentityFacade implements IdentityFacadePort {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
    private readonly users: UserRepository,
  ) {}

  register(command: RegisterUserCommand): Promise<AuthUserDto> {
    return this.commands.execute(command);
  }

  login(command: LoginUserCommand): Promise<AuthTokensDto> {
    return this.commands.execute(command);
  }

  refresh(command: RefreshTokensCommand): Promise<AuthTokensDto> {
    return this.commands.execute(command);
  }

  logout(command: LogoutUserCommand): Promise<void> {
    return this.commands.execute(command);
  }

  getCurrentUser(query: GetCurrentUserQuery): Promise<AuthUserDto> {
    return this.queries.execute(query);
  }

  async getUserById(userId: string): Promise<AuthUserDto | null> {
    const user = await this.users.findById(userId);
    return user ? toAuthUserDto(user) : null;
  }

  async resolveRoles(userId: string): Promise<string[]> {
    const user = await this.users.findById(userId);
    return user ? user.roles : [];
  }
}
