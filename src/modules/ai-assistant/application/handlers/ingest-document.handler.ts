import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { AiDocumentRepository } from '../../infrastructure/repositories/ai-document.repository';
import { chunkText } from '../../infrastructure/ingestion/chunker';
import { parseDocument } from '../../infrastructure/ingestion/parsers/document-parser';
import { scanPii } from '../../infrastructure/ingestion/pii-scanner';
import { validationFailed } from '../errors';
import { toDocumentSummary } from '../dto/document.mapper';
import type {
  DocumentSummaryDto,
  IngestDocumentInput,
} from '../ports/ai-assistant-port';

/**
 * Admin ingestion: parse → PII scan → chunk → pending_review → enqueue
 * embedding. Never embeds on the request path (data-model/ai-assistant.md).
 */
@Injectable()
export class IngestDocumentHandler {
  constructor(
    private readonly repository: AiDocumentRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async execute(input: IngestDocumentInput): Promise<DocumentSummaryDto> {
    if (!input.title?.trim()) {
      throw validationFailed('A document title is required.');
    }
    const text = await parseDocument(
      input.content,
      input.filename,
      input.mimeType,
      this.config.ai.ocrEnabled,
    );
    const clean = text.replace(/\r\n/g, '\n').trim();
    if (!clean) {
      throw validationFailed('The uploaded document contains no text.');
    }
    if (clean.length > 2_000_000) {
      throw validationFailed('The uploaded document is too large.');
    }

    const contentHash = createHash('sha256').update(clean).digest('hex');
    const existing = await this.repository.findDocumentByHash(contentHash);

    const meta = {
      title: input.title.trim(),
      category: input.category,
      source: input.source ?? input.filename ?? null,
      contentHash,
      effectiveDate: input.effectiveDate ?? null,
    };

    const doc = existing
      ? await this.repository.refreshDocument(existing.id, meta)
      : await this.repository.insertDocument(meta);

    if (existing) {
      await this.repository.deleteChunks(doc.id);
      await this.repository.deleteFindings(doc.id);
    }

    const chunks = chunkText(clean);
    await this.repository.insertChunks(doc.id, chunks);

    const findings = scanPii(clean);
    if (findings.length > 0) {
      await this.repository.insertFindings(doc.id, findings.slice(0, 100));
    }

    await this.repository.enqueueJob(doc.id, 'ingest');
    return toDocumentSummary(this.repository, doc);
  }
}
