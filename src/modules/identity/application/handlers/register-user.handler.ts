import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ConflictException } from '@nestjs/common';
import { RegisterUserCommand } from '../commands/register-user.command';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { Argon2Hasher } from '../../infrastructure/services/argon2-hasher';
import { toAuthUserDto } from '../dto/user.mapper';
import { AuthUserDto } from '../dto/auth-response.dto';

@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand> {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: Argon2Hasher,
  ) {}

  async execute(command: RegisterUserCommand): Promise<AuthUserDto> {
    const email = command.email.trim().toLowerCase();

    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_TAKEN',
        message: 'An account with this email already exists.',
      });
    }

    const passwordHash = await this.hasher.hash(command.password);
    const user = await this.users.create({
      email,
      passwordHash,
      displayName: command.displayName,
      phone: command.phone,
    });

    return toAuthUserDto(user);
  }
}
