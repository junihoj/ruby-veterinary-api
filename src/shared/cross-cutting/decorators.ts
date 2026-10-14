import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Auth decorators (§9). Public routes opt out of AuthGuard with @Public;
 * protected routes declare their requirement with @Requires; handlers read
 * the verified identity with @CurrentUser.
 */

export const IS_PUBLIC_KEY = 'isPublic';

/** Opt a route or controller out of AuthGuard (public browsing, ADR-0011). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export interface RequiresOptions {
  /** Any one of these role codes satisfies the requirement. */
  roles?: string[];
  /** Any one of these permission strings satisfies the requirement. */
  permissions?: string[];
}

export const REQUIRES_KEY = 'requires';

/** Declare the role/permission requirement of a protected route. */
export const Requires = (options: RequiresOptions) =>
  SetMetadata(REQUIRES_KEY, options);

/** The verified identity attached by AuthGuard to the request. */
export interface AuthUser {
  id: string;
  email: string;
  kind: 'client' | 'staff';
  roles: string[];
  permissions: string[];
}

type RequestWithUser = Request & { user?: AuthUser };

/** Param decorator injecting the current AuthUser into a handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    return req.user as AuthUser;
  },
);
