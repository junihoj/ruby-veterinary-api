import { Injectable } from '@nestjs/common';
import type { QueryResultRow } from 'pg';
import { AiKbDatabase } from '../db/ai-kb.database';

export interface DocumentRow extends QueryResultRow {
  id: string;
  title: string;
  category: string;
  source: string | null;
  content_hash: string;
  status: string;
  effective_date: string | Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface FindingRow extends QueryResultRow {
  id: string;
  rule: string;
  excerpt: string | null;
  severity: string;
}

export interface JobRow extends QueryResultRow {
  id: string;
  document_id: string | null;
  kind: string;
  status: string;
}

export interface ChunkRow extends QueryResultRow {
  id: string;
  content: string;
}

export interface RetrievalRow extends QueryResultRow {
  content: string;
  metadata: Record<string, unknown> | null;
  title: string;
  category: string;
  effective_date: string | Date | null;
  score: string | number;
}

export interface CreateDocumentInput {
  title: string;
  category: string;
  source: string | null;
  contentHash: string;
  effectiveDate: string | null;
}

/**
 * Raw-SQL persistence for `ai_kb` (data-model/ai-assistant.md). The schema is
 * deliberately outside Prisma; this repository is the only caller of the
 * dedicated least-privilege pool.
 */
@Injectable()
export class AiDocumentRepository {
  constructor(private readonly db: AiKbDatabase) {}

  private pool() {
    return this.db.require();
  }

  async findDocumentByHash(contentHash: string): Promise<DocumentRow | null> {
    const { rows } = await this.pool().query<DocumentRow>(
      `SELECT * FROM ai_kb.documents WHERE content_hash = $1 ORDER BY version DESC LIMIT 1`,
      [contentHash],
    );
    return rows[0] ?? null;
  }

  async findDocumentById(id: string): Promise<DocumentRow | null> {
    const { rows } = await this.pool().query<DocumentRow>(
      `SELECT * FROM ai_kb.documents WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async insertDocument(input: CreateDocumentInput): Promise<DocumentRow> {
    const { rows } = await this.pool().query<DocumentRow>(
      `INSERT INTO ai_kb.documents
         (title, category, source, content_hash, status, effective_date, version)
       VALUES ($1, $2, $3, $4, 'pending_review', $5::date, 1)
       RETURNING *`,
      [
        input.title,
        input.category,
        input.source,
        input.contentHash,
        input.effectiveDate,
      ],
    );
    return rows[0];
  }

  /** Re-ingest of identical content: bump version, reset to pending_review. */
  async refreshDocument(
    id: string,
    input: CreateDocumentInput,
  ): Promise<DocumentRow> {
    const { rows } = await this.pool().query<DocumentRow>(
      `UPDATE ai_kb.documents
          SET title = $2,
              category = $3,
              source = $4,
              effective_date = $5::date,
              status = 'pending_review',
              version = version + 1,
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [id, input.title, input.category, input.source, input.effectiveDate],
    );
    return rows[0];
  }

  async updateDocumentMeta(
    id: string,
    input: { title?: string; category?: string; effectiveDate?: string },
  ): Promise<DocumentRow> {
    const { rows } = await this.pool().query<DocumentRow>(
      `UPDATE ai_kb.documents
          SET title = COALESCE($2, title),
              category = COALESCE($3, category),
              effective_date = COALESCE($4::date, effective_date),
              updated_at = now()
        WHERE id = $1
        RETURNING *`,
      [
        id,
        input.title ?? null,
        input.category ?? null,
        input.effectiveDate ?? null,
      ],
    );
    return rows[0];
  }

  async setStatus(id: string, status: string): Promise<DocumentRow> {
    const { rows } = await this.pool().query<DocumentRow>(
      `UPDATE ai_kb.documents SET status = $2, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [id, status],
    );
    return rows[0];
  }

  async listDocuments(input: {
    status?: string;
    category?: string;
    limit: number;
    cursor?: string | null;
  }): Promise<{ items: DocumentRow[]; hasMore: boolean }> {
    const { rows } = await this.pool().query<DocumentRow>(
      `SELECT * FROM ai_kb.documents
        WHERE ($1::text IS NULL OR status = $1)
          AND ($2::text IS NULL OR category = $2)
          AND (
            $3::uuid IS NULL OR (created_at, id) <
              (SELECT created_at, id FROM ai_kb.documents WHERE id = $3::uuid)
          )
        ORDER BY created_at DESC, id DESC
        LIMIT $4`,
      [
        input.status ?? null,
        input.category ?? null,
        input.cursor ?? null,
        input.limit + 1,
      ],
    );
    const hasMore = rows.length > input.limit;
    return { items: hasMore ? rows.slice(0, input.limit) : rows, hasMore };
  }

  async insertChunks(documentId: string, chunks: string[]): Promise<void> {
    const client = await this.pool().connect();
    try {
      await client.query('BEGIN');
      for (let index = 0; index < chunks.length; index += 1) {
        await client.query(
          `INSERT INTO ai_kb.chunks (document_id, chunk_index, content, metadata)
           VALUES ($1, $2, $3, $4::jsonb)
           ON CONFLICT (document_id, chunk_index)
           DO UPDATE SET content = EXCLUDED.content, embedding = NULL`,
          [
            documentId,
            index,
            chunks[index],
            JSON.stringify({ strategy: 'recursive', index }),
          ],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteChunks(documentId: string): Promise<void> {
    await this.pool().query(`DELETE FROM ai_kb.chunks WHERE document_id = $1`, [
      documentId,
    ]);
  }

  async findChunksNeedingEmbedding(documentId: string): Promise<ChunkRow[]> {
    const { rows } = await this.pool().query<ChunkRow>(
      `SELECT id, content FROM ai_kb.chunks
        WHERE document_id = $1 AND embedding IS NULL
        ORDER BY chunk_index`,
      [documentId],
    );
    return rows;
  }

  async setEmbedding(
    chunkId: string,
    vector: number[],
    tokenCount: number,
  ): Promise<void> {
    await this.pool().query(
      `UPDATE ai_kb.chunks SET embedding = $2::vector, token_count = $3 WHERE id = $1`,
      [chunkId, toVectorLiteral(vector), tokenCount],
    );
  }

  async countChunks(documentId: string): Promise<number> {
    const { rows } = await this.pool().query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM ai_kb.chunks WHERE document_id = $1`,
      [documentId],
    );
    return rows[0]?.count ?? 0;
  }

  async getChunkContents(documentId: string): Promise<string[]> {
    const { rows } = await this.pool().query<ChunkRow>(
      `SELECT id, content FROM ai_kb.chunks WHERE document_id = $1 ORDER BY chunk_index`,
      [documentId],
    );
    return rows.map((row) => row.content);
  }

  async insertFindings(
    documentId: string,
    findings: Array<{ rule: string; excerpt: string; severity: string }>,
  ): Promise<void> {
    for (const finding of findings) {
      await this.pool().query(
        `INSERT INTO ai_kb.ingestion_findings (document_id, rule, excerpt, severity)
         VALUES ($1, $2, $3, $4)`,
        [documentId, finding.rule, finding.excerpt, finding.severity],
      );
    }
  }

  async deleteFindings(documentId: string): Promise<void> {
    await this.pool().query(
      `DELETE FROM ai_kb.ingestion_findings WHERE document_id = $1`,
      [documentId],
    );
  }

  async listFindings(documentId: string): Promise<FindingRow[]> {
    const { rows } = await this.pool().query<FindingRow>(
      `SELECT id, rule, excerpt, severity FROM ai_kb.ingestion_findings
        WHERE document_id = $1 ORDER BY created_at`,
      [documentId],
    );
    return rows;
  }

  async enqueueJob(documentId: string, kind: string): Promise<void> {
    await this.pool().query(
      `INSERT INTO ai_kb.ingestion_jobs (document_id, kind) VALUES ($1, $2)`,
      [documentId, kind],
    );
  }

  async claimJobs(limit: number): Promise<JobRow[]> {
    const { rows } = await this.pool().query<JobRow>(
      `WITH claimed AS (
         SELECT id FROM ai_kb.ingestion_jobs
          WHERE status = 'queued'
          ORDER BY created_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED
       )
       UPDATE ai_kb.ingestion_jobs j
          SET status = 'running', started_at = now()
         FROM claimed
        WHERE j.id = claimed.id
        RETURNING j.id, j.document_id, j.kind, j.status`,
      [limit],
    );
    return rows;
  }

  async finishJob(
    id: string,
    status: 'done' | 'failed',
    error: string | null,
  ): Promise<void> {
    await this.pool().query(
      `UPDATE ai_kb.ingestion_jobs
          SET status = $2, error = $3, finished_at = now()
        WHERE id = $1`,
      [id, status, error],
    );
  }

  async retrieve(embedding: number[], topK: number): Promise<RetrievalRow[]> {
    const { rows } = await this.pool().query<RetrievalRow>(
      `SELECT c.content, c.metadata, d.title, d.category, d.effective_date,
              1 - (c.embedding <=> $1::vector) AS score
         FROM ai_kb.chunks c
         JOIN ai_kb.documents d ON d.id = c.document_id
        WHERE d.status = 'active' AND c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $1::vector
        LIMIT $2`,
      [toVectorLiteral(embedding), topK],
    );
    return rows;
  }

  async ensureVectorIndex(): Promise<void> {
    try {
      await this.pool().query(
        `CREATE INDEX IF NOT EXISTS ix_chunks_embedding_ivfflat
           ON ai_kb.chunks USING ivfflat (embedding vector_cosine_ops)
           WITH (lists = 100)`,
      );
    } catch {
      // Index creation is an optimisation; retrieval works without it.
    }
  }

  async deleteDocument(id: string): Promise<boolean> {
    const result = await this.pool().query(
      `DELETE FROM ai_kb.documents WHERE id = $1`,
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.map((value) => Number(value).toFixed(8)).join(',')}]`;
}
