import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  CATALOG_MANAGER_EMAIL,
  CATALOG_MANAGER_PASSWORD,
} from '../prisma/seed-credentials';

/**
 * Seeds the public RAG corpus through the admin ingestion API (M6). This is
 * the "small CLI" from the M6 plan: the API remains the only ingestion path,
 * so the same validation, PII scan, queue, and human-approval gate apply.
 *
 * Usage:
 *   pnpm ai:ingest                     # default docs directory
 *   pnpm ai:ingest -- <dir>            # custom directory
 *
 * Env:
 *   API_BASE_URL        default http://localhost:3000/api/v1
 *   AI_SEED_EMAIL       default the seeded practice_manager
 *   AI_SEED_PASSWORD    default the seeded dev password
 *
 * Documents land `pending_review`; approve them with the admin API (or the
 * future admin UI) after reviewing the PII findings.
 */

interface SeedDocument {
  file: string;
  title: string;
  category: 'policy' | 'services' | 'hours' | 'pricing' | 'catalog' | 'faq';
  effectiveDate: string;
}

const SEED_DOCUMENTS: SeedDocument[] = [
  {
    file: 'company-policies.md',
    title: 'Company Policies',
    category: 'policy',
    effectiveDate: '2026-11-06',
  },
  {
    file: 'pet-care-faqs.md',
    title: 'Pet Care FAQs',
    category: 'faq',
    effectiveDate: '2026-11-06',
  },
  {
    file: 'product-catalog.md',
    title: 'Product Catalog',
    category: 'catalog',
    effectiveDate: '2026-11-06',
  },
];

interface DocumentSummary {
  id: string;
  title: string;
  status: string;
  version: number;
  chunkCount: number;
  findings: { rule: string; severity: string }[];
}

async function main(): Promise<void> {
  const apiBaseUrl = (
    process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1'
  ).replace(/\/+$/, '');
  const email = process.env.AI_SEED_EMAIL ?? CATALOG_MANAGER_EMAIL;
  const password = process.env.AI_SEED_PASSWORD ?? CATALOG_MANAGER_PASSWORD;
  const directory = resolve(
    process.argv[2] ?? join(process.cwd(), '..', 'ruby-veterinary-docs', 'rag-documents'),
  );

  console.log(`API:   ${apiBaseUrl}`);
  console.log(`Docs:  ${directory}`);
  console.log(`Login: ${email}`);

  const login = await request<{ tokens: { accessToken: string } }>(
    `${apiBaseUrl}/auth/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
  );

  for (const document of SEED_DOCUMENTS) {
    const path = join(directory, document.file);
    const content = await readFile(path);

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(content)], { type: 'text/markdown' }),
      document.file,
    );
    form.append(
      'metadata',
      JSON.stringify({
        title: document.title,
        category: document.category,
        source: `rag-documents/${document.file}`,
        effectiveDate: document.effectiveDate,
      }),
    );

    const summary = await request<DocumentSummary>(
      `${apiBaseUrl}/admin/ai/documents`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${login.tokens.accessToken}` },
        body: form,
      },
    );

    const flags = summary.findings
      .map((finding) => `${finding.rule}/${finding.severity}`)
      .join(', ');
    console.log(
      `${document.file} -> ${summary.id} [${summary.status}] v${summary.version}, ` +
        `${summary.chunkCount} chunk(s), findings: ${flags || 'none'}`,
    );
  }

  console.log(
    '\nDone. Review findings, then approve each document via ' +
      'POST /admin/ai/documents/:id/approve.',
  );
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${url} -> ${response.status}: ${text}`);
  }
  const parsed = (text ? JSON.parse(text) : undefined) as
    | { data?: T }
    | T
    | undefined;
  if (parsed && typeof parsed === 'object' && 'data' in parsed) {
    return (parsed as { data: T }).data;
  }
  return parsed as T;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
