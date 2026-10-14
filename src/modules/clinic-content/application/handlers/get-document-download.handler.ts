import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { HttpException, HttpStatus } from '@nestjs/common';
import { GetDocumentDownloadQuery } from '../queries/get-document-download.query';
import { DocumentRepository } from '../../infrastructure/repositories/document.repository';
import { ObjectStoragePort } from '../../../../shared/storage/object-storage.port';
import { DocumentDownloadDto } from '../dto/clinic-content.dto';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';

@QueryHandler(GetDocumentDownloadQuery)
export class GetDocumentDownloadHandler implements IQueryHandler<GetDocumentDownloadQuery> {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly storage: ObjectStoragePort,
  ) {}

  async execute(query: GetDocumentDownloadQuery): Promise<DocumentDownloadDto> {
    // Inbound id is `doc_<uuid>` (contract example); malformed ids are 404s,
    // never Prisma UUID validation errors.
    const documentId = PrefixedId.tryAnyToUuid(query.documentId);
    if (documentId === null) {
      throw new HttpException(
        { code: 'RESOURCE_NOT_FOUND', message: 'Document not found.' },
        HttpStatus.NOT_FOUND,
      );
    }
    const doc = await this.documents.findById(documentId);
    if (!doc) {
      throw new HttpException(
        { code: 'RESOURCE_NOT_FOUND', message: 'Document not found.' },
        HttpStatus.NOT_FOUND,
      );
    }

    const { url, expiresIn } = await this.storage.presignDownload(
      doc.objectKey,
    );
    return {
      downloadUrl: url,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }
}
