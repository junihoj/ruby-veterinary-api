import type {
  AiDocumentRepository,
  DocumentRow,
} from '../../infrastructure/repositories/ai-document.repository';
import type { DocumentSummaryDto } from '../ports/ai-assistant-port';
import { toDateOnly } from './date-only';

export function mapFinding(row: {
  id: string;
  rule: string;
  excerpt: string | null;
  severity: string;
}) {
  return {
    id: row.id,
    rule: row.rule,
    excerpt: row.excerpt,
    severity: row.severity,
  };
}

export async function toDocumentSummary(
  repository: AiDocumentRepository,
  doc: DocumentRow,
): Promise<DocumentSummaryDto> {
  const [chunkCount, findings] = await Promise.all([
    repository.countChunks(doc.id),
    repository.listFindings(doc.id),
  ]);
  return {
    id: doc.id,
    title: doc.title,
    category: doc.category,
    source: doc.source,
    status: doc.status,
    effectiveDate: toDateOnly(doc.effective_date),
    version: doc.version,
    chunkCount,
    findings: findings.map(mapFinding),
    createdAt: doc.created_at.toISOString(),
    updatedAt: doc.updated_at.toISOString(),
  };
}
