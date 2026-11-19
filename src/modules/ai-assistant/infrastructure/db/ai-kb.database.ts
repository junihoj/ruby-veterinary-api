import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { aiUnavailable } from '../../application/errors';

/**
 * Dedicated least-privilege connection to the `ai_kb` schema (ADR-0017).
 * Prisma never sees this schema: the `ai_kb_app` role has no access to any
 * clinical/identity table. A missing URL disables the AI feature rather than
 * breaking boot; callers receive a 503 DEPENDENCY_UNAVAILABLE.
 */
@Injectable()
export class AiKbDatabase implements OnModuleDestroy {
  private readonly pool: Pool | null;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.pool = config.ai.kbDatabaseUrl
      ? new Pool({
          connectionString: config.ai.kbDatabaseUrl,
          max: 5,
          idleTimeoutMillis: 30_000,
        })
      : null;
  }

  require(): Pool {
    if (!this.pool) {
      throw aiUnavailable(
        'The AI knowledge base is not configured (AI_KB_DATABASE_URL).',
      );
    }
    return this.pool;
  }

  get configured(): boolean {
    return this.pool !== null;
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
