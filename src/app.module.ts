import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RequestIdMiddleware } from './shared/cross-cutting/request-id.middleware';
import { AuthModule } from './shared/auth/auth.module';
import { StorageModule } from './shared/storage/storage.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { ClinicContentModule } from './modules/clinic-content/clinic-content.module';
import { PublishingModule } from './modules/publishing/publishing.module';
import { CareCoordinationModule } from './modules/care-coordination/care-coordination.module';
import { ClientPatientRecordsModule } from './modules/client-patient-records/client-patient-records.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { PharmacyAuthorisationModule } from './modules/pharmacy-authorisation/pharmacy-authorisation.module';
import { CareMessagingModule } from './modules/care-messaging/care-messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OperationsModule } from './modules/operations/operations.module';

/**
 * Root module (§2). Wires the global infra layers (config, prisma) and imports
 * every bounded-context module plus health. Context modules never import each
 * other directly — cross-context calls go through facade ports (§10).
 */
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuthModule,
    StorageModule,
    // Rate limits (api-specification.md §Rate Limits): public reads are
    // 120 req/min per IP; auth routes tighten to 10 per 10 min with @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    HealthModule,
    IdentityModule,
    ClinicContentModule,
    PublishingModule,
    CareCoordinationModule,
    ClientPatientRecordsModule,
    CommerceModule,
    PharmacyAuthorisationModule,
    CareMessagingModule,
    NotificationsModule,
    OperationsModule,
  ],
  // ThrottlerGuard is not auto-registered by ThrottlerModule (v6) — the 429
  // contract (RATE_LIMITED + Retry-After) requires it as a global guard.
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
