import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { HttpException, HttpStatus } from '@nestjs/common';
import { GetCurrentUserQuery } from '../queries/get-current-user.query';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { toAuthUserDto } from '../dto/user.mapper';
import { AuthUserDto } from '../dto/auth-response.dto';

@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserHandler implements IQueryHandler<GetCurrentUserQuery> {
  constructor(private readonly users: UserRepository) {}

  async execute(query: GetCurrentUserQuery): Promise<AuthUserDto> {
    const user = await this.users.findById(query.userId);
    if (!user || user.status === 'deleted') {
      throw new HttpException(
        { code: 'RESOURCE_NOT_FOUND', message: 'User not found.' },
        HttpStatus.NOT_FOUND,
      );
    }
    return toAuthUserDto(user);
  }
}
