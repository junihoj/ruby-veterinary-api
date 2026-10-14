import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_KEY, RequiresOptions } from './decorators';

/**
 * Enforces @Requires metadata against the verified identity (§9). Runs
 * after AuthGuard, so req.user is always present here. Routes without
 * @Requires are open to any authenticated caller.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiresOptions>(
      REQUIRES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const req = context.switchToHttp().getRequest<{
      user?: { roles?: string[]; permissions?: string[] };
    }>();
    const user = req.user;
    if (!user) {
      throw new HttpException(
        { code: 'STAFF_ONLY', message: 'Authentication required.' },
        HttpStatus.FORBIDDEN,
      );
    }

    const roles = required.roles ?? [];
    const permissions = required.permissions ?? [];
    const hasRole =
      roles.length === 0 || roles.some((r) => user.roles?.includes(r));
    const hasPermission =
      permissions.length === 0 ||
      permissions.some((p) => user.permissions?.includes(p));

    if (hasRole && hasPermission) return true;

    throw new ForbiddenException({
      code: 'STAFF_ONLY',
      message: 'You do not have permission to perform this action.',
    });
  }
}
