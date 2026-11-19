/**
 * Public API of the AI Assistant context (§6.1). Care Messaging depends only
 * on this port; the in-process adapter is bound behind it so the module can be
 * extracted to an HTTP service later without changing callers.
 */
export type ChatRole = 'user' | 'assistant';

export interface ChatHistoryMessage {
  role: ChatRole;
  content: string;
}

export interface AnswerInput {
  question: string;
  history?: ChatHistoryMessage[];
  topK?: number;
  minScore?: number;
}

export interface CitationDto {
  title: string;
  category: string;
  effectiveDate: string | null;
}

export interface AnswerResult {
  text: string;
  citations: CitationDto[];
  weakRetrieval: boolean;
  promptTokens: number;
  completionTokens: number;
}

export type DocumentCategory =
  'policy' | 'services' | 'hours' | 'pricing' | 'catalog' | 'faq' | 'other';

export type DocumentStatus = 'pending_review' | 'active' | 'archived';

export interface IngestDocumentInput {
  title: string;
  category: DocumentCategory;
  source?: string | null;
  effectiveDate?: string | null;
  content: Buffer;
  filename: string;
  mimeType?: string;
}

export interface FindingDto {
  id: string;
  rule: string;
  excerpt: string | null;
  severity: string;
}

export interface DocumentSummaryDto {
  id: string;
  title: string;
  category: string;
  source: string | null;
  status: string;
  effectiveDate: string | null;
  version: number;
  chunkCount: number;
  findings: FindingDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ListDocumentsInput {
  status?: string;
  category?: string;
  limit?: number;
  cursor?: string | null;
}

export interface DocumentPage {
  items: DocumentSummaryDto[];
  cursor: string | null;
  hasMore: boolean;
}

export interface UpdateDocumentInput {
  title?: string;
  category?: DocumentCategory;
  effectiveDate?: string | null;
}

export abstract class AiAssistantPort {
  abstract answer(
    input: AnswerInput,
    onToken?: (token: string) => void,
  ): Promise<AnswerResult>;
  abstract ingest(input: IngestDocumentInput): Promise<DocumentSummaryDto>;
  abstract listDocuments(input: ListDocumentsInput): Promise<DocumentPage>;
  abstract getDocument(id: string): Promise<DocumentSummaryDto>;
  abstract updateDocument(
    id: string,
    input: UpdateDocumentInput,
  ): Promise<DocumentSummaryDto>;
  abstract approveDocument(id: string): Promise<DocumentSummaryDto>;
  abstract reindexDocument(id: string): Promise<DocumentSummaryDto>;
  abstract archiveDocument(id: string): Promise<DocumentSummaryDto>;
  abstract deleteDocument(id: string): Promise<void>;
}
