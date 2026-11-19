import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.types';
import { AiAssistantFacade } from './application/facades/ai-assistant.facade';
import { AnswerHandler } from './application/handlers/answer.handler';
import { IngestDocumentHandler } from './application/handlers/ingest-document.handler';
import {
  ApproveDocumentHandler,
  ArchiveDocumentHandler,
  DeleteDocumentHandler,
  GetDocumentHandler,
  ListDocumentsHandler,
  ReindexDocumentHandler,
  UpdateDocumentHandler,
} from './application/handlers/document.handlers';
import { AiAssistantPort } from './application/ports/ai-assistant-port';
import { EmbeddingPort } from './application/ports/embedding-port';
import { LlmPort } from './application/ports/llm-port';
import { FallbackEmbeddingAdapter } from './infrastructure/adapters/fallback-embedding.adapter';
import { FallbackLlmAdapter } from './infrastructure/adapters/fallback-llm.adapter';
import { InProcessAiAssistantAdapter } from './infrastructure/adapters/in-process-ai-assistant.adapter';
import { OpenAiEmbeddingAdapter } from './infrastructure/adapters/openai-embedding.adapter';
import { OpenAiLlmAdapter } from './infrastructure/adapters/openai-llm.adapter';
import { AiKbDatabase } from './infrastructure/db/ai-kb.database';
import { IngestionWorker } from './infrastructure/ingestion/ingestion.worker';
import { AiDocumentRepository } from './infrastructure/repositories/ai-document.repository';
import { PgvectorRetriever } from './infrastructure/retrieval/pgvector-retriever';
import { AiDocumentsController } from './presentation/ai-documents.controller';

/**
 * AI Assistant bounded context (schema: ai_kb, accessed over raw pg — ADR-0017).
 * Swappable providers: OpenAI by default, deterministic offline fallbacks when
 * no key is configured (dev + e2e). Care Messaging sees only AiAssistantPort.
 */
@Module({
  controllers: [AiDocumentsController],
  providers: [
    AiKbDatabase,
    AiDocumentRepository,
    PgvectorRetriever,
    IngestionWorker,
    OpenAiLlmAdapter,
    OpenAiEmbeddingAdapter,
    FallbackLlmAdapter,
    FallbackEmbeddingAdapter,
    {
      provide: LlmPort,
      inject: [APP_CONFIG, OpenAiLlmAdapter, FallbackLlmAdapter],
      useFactory: (
        config: AppConfig,
        openai: OpenAiLlmAdapter,
        fallback: FallbackLlmAdapter,
      ): LlmPort => (config.ai.openAiApiKey ? openai : fallback),
    },
    {
      provide: EmbeddingPort,
      inject: [APP_CONFIG, OpenAiEmbeddingAdapter, FallbackEmbeddingAdapter],
      useFactory: (
        config: AppConfig,
        openai: OpenAiEmbeddingAdapter,
        fallback: FallbackEmbeddingAdapter,
      ): EmbeddingPort => (config.ai.openAiApiKey ? openai : fallback),
    },
    AnswerHandler,
    IngestDocumentHandler,
    ListDocumentsHandler,
    GetDocumentHandler,
    UpdateDocumentHandler,
    ApproveDocumentHandler,
    ReindexDocumentHandler,
    ArchiveDocumentHandler,
    DeleteDocumentHandler,
    AiAssistantFacade,
    InProcessAiAssistantAdapter,
    { provide: AiAssistantPort, useExisting: InProcessAiAssistantAdapter },
  ],
  exports: [AiAssistantPort],
})
export class AiAssistantModule {}
