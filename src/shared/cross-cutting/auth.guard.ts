import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../config/config.types';
import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY, AuthUser } from './decorators';

/**
 * Verifies the `Authorization: Bearer <access token>` header (ADR-0011).
 * Default-deny: routes without @Public must present a valid, unexpired
 * access token. The verified identity is attached to the request for
 * @CurrentUser and RolesGuard. Routes marked @OptionalAuth attach the
 * identity when a valid token is present and stay anonymous otherwise —
 * they never 401 (M4 intake forms, `security: []` in the contract).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const isOptional = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      if (isOptional) return true;
      throw new HttpException(
        { code: 'INVALID_CREDENTIALS', message: 'Missing bearer token.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.jwtAccessSecret,
      });
    } catch (err) {
      // Optional routes swallow token problems — anonymous is a legal
      // answer there; the contract has no 401 for them.
      if (isOptional) return true;
      const expired = err instanceof Error && err.name === 'TokenExpiredError';
      throw new HttpException(
        {
          code: expired ? 'TOKEN_EXPIRED' : 'INVALID_CREDENTIALS',
          message: expired
            ? 'Access token has expired.'
            : 'Invalid access token.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const sub = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    const user: AuthUser = {
      id: sub,
      email,
      kind: payload.kind === 'staff' ? 'staff' : 'client',
      roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
      permissions: Array.isArray(payload.permissions)
        ? (payload.permissions as string[])
        : [],
    };
    req.user = user;
    return true;
  }
}
