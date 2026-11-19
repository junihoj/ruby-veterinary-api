import { Injectable } from '@nestjs/common';
import { toDateOnly } from '../../application/dto/date-only';
import { AiDocumentRepository } from '../repositories/ai-document.repository';
import type { RetrievedContext } from './prompt-builder';

/** Cosine-similarity retrieval over active `ai_kb.chunks` (pgvector `<=>`). */
@Injectable()
export class PgvectorRetriever {
  constructor(private readonly documents: AiDocumentRepository) {}

  async retrieve(
    embedding: number[],
    topK: number,
  ): Promise<RetrievedContext[]> {
    const rows = await this.documents.retrieve(embedding, topK);
    return rows.map((row) => ({
      content: row.content,
      title: row.title,
      category: row.category,
      effectiveDate: toDateOnly(row.effective_date),
      score: Number(row.score),
    }));
  }
}
