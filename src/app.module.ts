import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RequestIdMiddleware } from './shared/cross-cutting/request-id.middleware';
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
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
