import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/config.types';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from '../cross-cutting/auth.guard';
import { RolesGuard } from '../cross-cutting/roles.guard';

/**
 * Global auth wiring (§9, ADR-0011): JwtModule signs/verifies access tokens
 * with the configured access secret; AuthGuard (default-deny, @Public opt-out)
 * and RolesGuard (@Requires) run as global guards on every route.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.jwtAccessSecret,
        signOptions: { expiresIn: config.jwtAccessTtlSeconds },
      }),
    }),
  ],
  providers: [
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
