import { randomBytes } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { AiAssistantPort } from '../src/modules/ai-assistant/application/ports/ai-assistant-port';
import { AiDocumentRepository } from '../src/modules/ai-assistant/infrastructure/repositories/ai-document.repository';
import { IngestionWorker } from '../src/modules/ai-assistant/infrastructure/ingestion/ingestion.worker';
import {
  VETERINARIAN_EMAIL,
  VETERINARIAN_PASSWORD,
} from '../prisma/seed-credentials';

interface Envelope<T> {
  data: T;
}

interface AuthTokens {
  tokens: { accessToken: string };
}

interface DocumentResponse {
  id: string;
  title: string;
  status: string;
  version: number;
  chunkCount: number;
  findings: Array<{ rule: string }>;
}

jest.setTimeout(180_000);

describe('AI knowledge base — ingest, approve, retrieve (e2e, M6a)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token = '';

  const server = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = (await createApp()) as INestApplication<App>;
    prisma = app.get(PrismaService);

    const login = await server()
      .post('/api/v1/auth/login')
      .send({ email: VETERINARIAN_EMAIL, password: VETERINARIAN_PASSWORD })
      .expect(200);
    token = (login.body as Envelope<AuthTokens>).data.tokens.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('ingests, reports PII, requires approval, embeds, and retrieves', async () => {
    const marker = randomBytes(4).toString('hex');
    const title = `Clinic hours ${marker}`;
    const content = [
      '# Clinic opening hours',
      '',
      'Our clinic is open Monday to Friday from 8am to 6pm.',
      'On Saturday we are open from 9am to 2pm.',
      'We are closed on Sundays and public holidays.',
      'Emergency walk-ins are seen immediately.',
      `Contact: hours-${marker}@example.com`,
      '',
    ].join('\n');

    const ingest = await server()
      .post('/api/v1/admin/ai/documents')
      .set('Authorization', `Bearer ${token}`)
      .field(
        'metadata',
        JSON.stringify({
          title,
          category: 'hours',
          effectiveDate: '2026-01-01',
        }),
      )
      .attach('file', Buffer.from(content, 'utf8'), {
        filename: 'hours.md',
        contentType: 'text/markdown',
      })
      .expect(201);

    const first = (ingest.body as Envelope<DocumentResponse>).data;
    expect(first.status).toBe('pending_review');
    expect(first.version).toBe(1);
    expect(first.findings.some((finding) => finding.rule === 'pii_email')).toBe(
      true,
    );

    // Pending documents are not retrievable.
    const beforeApproval = await app.get(AiAssistantPort).answer({
      question:
        'clinic open Monday Friday 8am 6pm Saturday 9am 2pm Sunday closed',
    });
    expect(
      beforeApproval.citations.some((citation) => citation.title === title),
    ).toBe(false);

    const approved = await server()
      .post(`/api/v1/admin/ai/documents/${first.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((approved.body as Envelope<DocumentResponse>).data.status).toBe(
      'active',
    );

    await drainIngestion(first.id);

    const answer = await app.get(AiAssistantPort).answer({
      question:
        'clinic open Monday Friday 8am 6pm Saturday 9am 2pm Sunday closed',
    });
    expect(answer.citations.some((citation) => citation.title === title)).toBe(
      true,
    );

    // Same content re-ingested bumps version and returns to pending_review.
    const reingest = await server()
      .post('/api/v1/admin/ai/documents')
      .set('Authorization', `Bearer ${token}`)
      .field(
        'metadata',
        JSON.stringify({
          title,
          category: 'hours',
          effectiveDate: '2026-01-01',
        }),
      )
      .attach('file', Buffer.from(content, 'utf8'), {
        filename: 'hours.md',
        contentType: 'text/markdown',
      })
      .expect(201);

    const second = (reingest.body as Envelope<DocumentResponse>).data;
    expect(second.id).toBe(first.id);
    expect(second.version).toBe(2);
    expect(second.status).toBe('pending_review');

    await server()
      .post(`/api/v1/admin/ai/documents/${first.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await drainIngestion(first.id);

    // Archive removes it from retrieval immediately.
    const archived = await server()
      .post(`/api/v1/admin/ai/documents/${first.id}/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((archived.body as Envelope<DocumentResponse>).data.status).toBe(
      'archived',
    );

    const afterArchive = await app.get(AiAssistantPort).answer({
      question:
        'clinic open Monday Friday 8am 6pm Saturday 9am 2pm Sunday closed',
    });
    expect(
      afterArchive.citations.some((citation) => citation.title === title),
    ).toBe(false);

    // Delete is immediate and cascades.
    await server()
      .delete(`/api/v1/admin/ai/documents/${first.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await server()
      .get(`/api/v1/admin/ai/documents/${first.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const row = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*)::bigint AS count FROM ai_kb.documents WHERE id = ${first.id}::uuid
    `;
    expect(Number(row[0].count)).toBe(0);
  });

  async function drainIngestion(documentId: string): Promise<void> {
    const worker = app.get(IngestionWorker);
    const repository = app.get(AiDocumentRepository);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await worker.processOnce();
      const pending = await repository.findChunksNeedingEmbedding(documentId);
      if (pending.length === 0) return;
    }
    throw new Error('Ingestion worker did not embed all chunks.');
  }
});
