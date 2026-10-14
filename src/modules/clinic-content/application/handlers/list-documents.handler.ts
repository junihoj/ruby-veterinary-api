import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { ListDocumentsQuery } from '../queries/list-documents.query';
import { DocumentRepository } from '../../infrastructure/repositories/document.repository';
import { DocumentSummaryDto } from '../dto/clinic-content.dto';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';

@QueryHandler(ListDocumentsQuery)
export class ListDocumentsHandler implements IQueryHandler<ListDocumentsQuery> {
  constructor(private readonly documents: DocumentRepository) {}

  async execute(query: ListDocumentsQuery): Promise<{
    data: DocumentSummaryDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const rows = await this.documents.findPublished(
      query.limit,
      parseCursor(query.cursor),
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      data: page.map((row) => ({
        id: PrefixedId.format('document', row.id),
        title: row.title,
        slug: row.slug,
        description: row.description,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
      })),
      nextCursor: hasMore
        ? PrefixedId.format('document', page[page.length - 1].id)
        : null,
      hasMore,
    };
  }
}
