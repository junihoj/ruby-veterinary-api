import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';

export interface AccessTokenClaims {
  sub: string;
  email: string;
  kind: 'client' | 'staff';
  roles: string[];
  permissions: string[];
}

export interface IssuedAccessToken {
  token: string;
  expiresIn: number;
}

/**
 * Access-token service (identity, ADR-0011). Signs short-lived JWTs with
 * role and permission claims; verification is AuthGuard's job via the same
 * configured secret.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  signAccessToken(claims: AccessTokenClaims): IssuedAccessToken {
    const token = this.jwt.sign(claims, {
      secret: this.config.jwtAccessSecret,
      expiresIn: this.config.jwtAccessTtlSeconds,
    });
    return { token, expiresIn: this.config.jwtAccessTtlSeconds };
  }
}
