import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.types';
import type { AppConfig } from '../config/config.types';
import { PrismaService } from './prisma.service';

/**
 * Global Prisma module (§2). Modules do not import it; repositories inject
 * PrismaService directly. Prisma-backed access stays inside
 * `infrastructure/repositories/` of each context (§10 rule 5).
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new PrismaService(config),
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
