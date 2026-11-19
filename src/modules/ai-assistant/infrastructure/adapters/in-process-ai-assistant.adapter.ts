import { Injectable } from '@nestjs/common';
import { AiAssistantFacade } from '../../application/facades/ai-assistant.facade';
import {
  AiAssistantPort,
  type AnswerInput,
  type AnswerResult,
  type DocumentPage,
  type DocumentSummaryDto,
  type IngestDocumentInput,
  type ListDocumentsInput,
  type UpdateDocumentInput,
} from '../../application/ports/ai-assistant-port';

/**
 * In-process adapter for AiAssistantPort. Keeps callers (Care Messaging)
 * unaware of whether the AI module is co-deployed or extracted to HTTP.
 */
@Injectable()
export class InProcessAiAssistantAdapter extends AiAssistantPort {
  constructor(private readonly facade: AiAssistantFacade) {
    super();
  }

  answer(
    input: AnswerInput,
    onToken?: (token: string) => void,
  ): Promise<AnswerResult> {
    return this.facade.answer(input, onToken);
  }

  ingest(input: IngestDocumentInput): Promise<DocumentSummaryDto> {
    return this.facade.ingest(input);
  }

  listDocuments(input: ListDocumentsInput): Promise<DocumentPage> {
    return this.facade.listDocuments(input);
  }

  getDocument(id: string): Promise<DocumentSummaryDto> {
    return this.facade.getDocument(id);
  }

  updateDocument(
    id: string,
    input: UpdateDocumentInput,
  ): Promise<DocumentSummaryDto> {
    return this.facade.updateDocument(id, input);
  }

  approveDocument(id: string): Promise<DocumentSummaryDto> {
    return this.facade.approveDocument(id);
  }

  reindexDocument(id: string): Promise<DocumentSummaryDto> {
    return this.facade.reindexDocument(id);
  }

  archiveDocument(id: string): Promise<DocumentSummaryDto> {
    return this.facade.archiveDocument(id);
  }

  deleteDocument(id: string): Promise<void> {
    return this.facade.deleteDocument(id);
  }
}
