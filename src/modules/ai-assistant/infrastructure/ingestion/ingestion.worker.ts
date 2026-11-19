import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { EmbeddingPort } from '../../application/ports/embedding-port';
import {
  AiDocumentRepository,
  type JobRow,
} from '../repositories/ai-document.repository';
import { estimateTokens } from '../adapters/openai-llm.adapter';

/**
 * In-process, DB-backed ingestion worker (ADR-0015 rule 7: no Redis). Claims
 * queued jobs with FOR UPDATE SKIP LOCKED and embeds any chunks that lack a
 * vector. Ticks on a configurable interval; 0 disables it (e2e).
 */
@Injectable()
export class IngestionWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EmbeddingPort) private readonly embeddings: EmbeddingPort,
    private readonly repository: AiDocumentRepository,
  ) {}

  onModuleInit(): void {
    const tick = this.config.ai.ingestionTickMs;
    if (tick <= 0) return;
    this.timer = setInterval(() => {
      void this.processOnce();
    }, tick);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async processOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = await this.repository.claimJobs(5);
      for (const job of jobs) {
        await this.processJob(job);
      }
    } catch {
      // A transient DB error must never crash the process; the next tick
      // re-claims jobs that are still queued.
    } finally {
      this.running = false;
    }
  }

  private async processJob(job: JobRow): Promise<void> {
    try {
      if (
        (job.kind === 'ingest' || job.kind === 'reindex') &&
        job.document_id
      ) {
        const chunks = await this.repository.findChunksNeedingEmbedding(
          job.document_id,
        );
        for (let offset = 0; offset < chunks.length; offset += 32) {
          const batch = chunks.slice(offset, offset + 32);
          const { vectors } = await this.embeddings.embed(
            batch.map((chunk) => chunk.content),
          );
          for (let index = 0; index < batch.length; index += 1) {
            await this.repository.setEmbedding(
              batch[index].id,
              vectors[index],
              estimateTokens(batch[index].content),
            );
          }
        }
        await this.repository.ensureVectorIndex();
      }
      await this.repository.finishJob(job.id, 'done', null);
    } catch (error) {
      await this.repository.finishJob(
        job.id,
        'failed',
        error instanceof Error ? error.message : 'Unknown ingestion error',
      );
    }
  }
}
