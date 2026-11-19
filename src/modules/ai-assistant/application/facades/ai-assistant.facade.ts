import { Injectable } from '@nestjs/common';
import { AnswerHandler } from '../handlers/answer.handler';
import { IngestDocumentHandler } from '../handlers/ingest-document.handler';
import {
  ApproveDocumentHandler,
  ArchiveDocumentHandler,
  DeleteDocumentHandler,
  GetDocumentHandler,
  ListDocumentsHandler,
  ReindexDocumentHandler,
  UpdateDocumentHandler,
} from '../handlers/document.handlers';
import type {
  AnswerInput,
  AnswerResult,
  DocumentPage,
  DocumentSummaryDto,
  IngestDocumentInput,
  ListDocumentsInput,
  UpdateDocumentInput,
} from '../ports/ai-assistant-port';

/** Thin delegation facade (§3): no business logic lives here. */
@Injectable()
export class AiAssistantFacade {
  constructor(
    private readonly answerHandler: AnswerHandler,
    private readonly ingestHandler: IngestDocumentHandler,
    private readonly listHandler: ListDocumentsHandler,
    private readonly getHandler: GetDocumentHandler,
    private readonly updateHandler: UpdateDocumentHandler,
    private readonly approveHandler: ApproveDocumentHandler,
    private readonly reindexHandler: ReindexDocumentHandler,
    private readonly archiveHandler: ArchiveDocumentHandler,
    private readonly deleteHandler: DeleteDocumentHandler,
  ) {}

  answer(
    input: AnswerInput,
    onToken?: (token: string) => void,
  ): Promise<AnswerResult> {
    return this.answerHandler.execute(input, onToken);
  }

  ingest(input: IngestDocumentInput): Promise<DocumentSummaryDto> {
    return this.ingestHandler.execute(input);
  }

  listDocuments(input: ListDocumentsInput): Promise<DocumentPage> {
    return this.listHandler.execute(input);
  }

  getDocument(id: string): Promise<DocumentSummaryDto> {
    return this.getHandler.execute(id);
  }

  updateDocument(
    id: string,
    input: UpdateDocumentInput,
  ): Promise<DocumentSummaryDto> {
    return this.updateHandler.execute(id, input);
  }

  approveDocument(id: string): Promise<DocumentSummaryDto> {
    return this.approveHandler.execute(id);
  }

  reindexDocument(id: string): Promise<DocumentSummaryDto> {
    return this.reindexHandler.execute(id);
  }

  archiveDocument(id: string): Promise<DocumentSummaryDto> {
    return this.archiveHandler.execute(id);
  }

  deleteDocument(id: string): Promise<void> {
    return this.deleteHandler.execute(id);
  }
}
