-- M6a: AI knowledge base schema + least-privilege role (ADR-0017).
-- Kept OUT of the Prisma datasource `schemas` list on purpose: the AI module
-- reaches `ai_kb` through a dedicated pg.Pool as `ai_kb_app`, which has no
-- access to clinical/identity schemas. pgvector provides `vector(1536)`.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS ai_kb;

-- Dev default password; production operators MUST rotate this with
--   ALTER ROLE ai_kb_app WITH PASSWORD '<secret>';
-- and put the full connection string in AI_KB_DATABASE_URL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_kb_app') THEN
    CREATE ROLE ai_kb_app WITH LOGIN PASSWORD 'ai_kb_dev_password';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS ai_kb.documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    category        TEXT NOT NULL,
    source          TEXT,
    content_hash    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending_review',
    effective_date  DATE,
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_documents_hash_version UNIQUE (content_hash, version)
);

CREATE INDEX IF NOT EXISTS ix_documents_status ON ai_kb.documents (status);

CREATE TABLE IF NOT EXISTS ai_kb.chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES ai_kb.documents(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    embedding       vector(1536),
    token_count     INTEGER,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_chunks_doc_index UNIQUE (document_id, chunk_index)
);

-- The ivfflat index is created lazily by the ingestion worker after the
-- first embedding batch (data-model/ai-assistant.md invariant).

CREATE TABLE IF NOT EXISTS ai_kb.ingestion_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID REFERENCES ai_kb.documents(id) ON DELETE SET NULL,
    kind            TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued',
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_ingestion_jobs_queue ON ai_kb.ingestion_jobs (status, created_at);

CREATE TABLE IF NOT EXISTS ai_kb.ingestion_findings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES ai_kb.documents(id) ON DELETE CASCADE,
    rule            TEXT NOT NULL,
    excerpt         TEXT,
    severity        TEXT NOT NULL DEFAULT 'low',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Least-privilege grants: ai_kb only, no public schema.
GRANT USAGE ON SCHEMA ai_kb TO ai_kb_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai_kb TO ai_kb_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA ai_kb
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_kb_app;
REVOKE USAGE ON SCHEMA public FROM ai_kb_app;
