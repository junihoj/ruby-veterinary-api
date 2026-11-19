import { Injectable } from '@nestjs/common';
import { AiDocumentRepository } from '../../infrastructure/repositories/ai-document.repository';
import { chunkText } from '../../infrastructure/ingestion/chunker';
import { notFound, stateConflict, validationFailed } from '../errors';
import { toDocumentSummary } from '../dto/document.mapper';
import type {
  DocumentPage,
  DocumentSummaryDto,
  ListDocumentsInput,
  UpdateDocumentInput,
} from '../ports/ai-assistant-port';

@Injectable()
export class ListDocumentsHandler {
  constructor(private readonly repository: AiDocumentRepository) {}

  async execute(input: ListDocumentsInput): Promise<DocumentPage> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const { items, hasMore } = await this.repository.listDocuments({
      ...(input.status ? { status: input.status } : {}),
      ...(input.category ? { category: input.category } : {}),
      limit,
      cursor: input.cursor ?? null,
    });
    const summaries = await Promise.all(
      items.map((doc) => toDocumentSummary(this.repository, doc)),
    );
    return {
      items: summaries,
      cursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }
}

@Injectable()
export class GetDocumentHandler {
  constructor(private readonly repository: AiDocumentRepository) {}

  async execute(id: string): Promise<DocumentSummaryDto> {
    const doc = await this.repository.findDocumentById(id);
    if (!doc) throw notFound();
    return toDocumentSummary(this.repository, doc);
  }
}

@Injectable()
export class UpdateDocumentHandler {
  constructor(private readonly repository: AiDocumentRepository) {}

  async execute(
    id: string,
    input: UpdateDocumentInput,
  ): Promise<DocumentSummaryDto> {
    const existing = await this.repository.findDocumentById(id);
    if (!existing) throw notFound();
    const doc = await this.repository.updateDocumentMeta(id, {
      ...(input.title ? { title: input.title } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.effectiveDate ? { effectiveDate: input.effectiveDate } : {}),
    });
    return toDocumentSummary(this.repository, doc);
  }
}

@Injectable()
export class ApproveDocumentHandler {
  constructor(private readonly repository: AiDocumentRepository) {}

  async execute(id: string): Promise<DocumentSummaryDto> {
    const doc = await this.repository.findDocumentById(id);
    if (!doc) throw notFound();
    if (doc.status !== 'pending_review') {
      throw stateConflict('Only a pending_review document can be approved.');
    }
    const updated = await this.repository.setStatus(id, 'active');
    // Ensures a worker pass covers any chunks whose first job failed.
    await this.repository.enqueueJob(id, 'ingest');
    return toDocumentSummary(this.repository, updated);
  }
}

@Injectable()
export class ReindexDocumentHandler {
  constructor(private readonly repository: AiDocumentRepository) {}

  async execute(id: string): Promise<DocumentSummaryDto> {
    const doc = await this.repository.findDocumentById(id);
    if (!doc) throw notFound();
    const contents = await this.repository.getChunkContents(id);
    const text = contents.join('\n\n').trim();
    if (!text) {
      throw validationFailed('This document has no stored content to reindex.');
    }
    const chunks = chunkText(text);
    await this.repository.deleteChunks(id);
    await this.repository.insertChunks(id, chunks);
    await this.repository.enqueueJob(id, 'reindex');
    return toDocumentSummary(this.repository, doc);
  }
}

@Injectable()
export class ArchiveDocumentHandler {
  constructor(private readonly repository: AiDocumentRepository) {}

  async execute(id: string): Promise<DocumentSummaryDto> {
    const doc = await this.repository.findDocumentById(id);
    if (!doc) throw notFound();
    if (doc.status === 'archived') {
      return toDocumentSummary(this.repository, doc);
    }
    const updated = await this.repository.setStatus(id, 'archived');
    return toDocumentSummary(this.repository, updated);
  }
}

@Injectable()
export class DeleteDocumentHandler {
  constructor(private readonly repository: AiDocumentRepository) {}

  async execute(id: string): Promise<void> {
    const deleted = await this.repository.deleteDocument(id);
    if (!deleted) throw notFound();
  }
}
