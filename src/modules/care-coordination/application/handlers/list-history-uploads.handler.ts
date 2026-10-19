import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ListHistoryUploadsQuery } from '../queries/list-history-uploads.query';
import { toHistoryUploadDto } from '../dto/care.mapper';
import { HistoryUploadDto } from '../dto/care.responses.dto';
import { HistoryUploadRepository } from '../../infrastructure/repositories/history-upload.repository';

@QueryHandler(ListHistoryUploadsQuery)
export class ListHistoryUploadsHandler implements IQueryHandler<ListHistoryUploadsQuery> {
  constructor(private readonly uploads: HistoryUploadRepository) {}

  async execute(query: ListHistoryUploadsQuery): Promise<{
    data: HistoryUploadDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const rows = await this.uploads.list(
      query.filters,
      query.limit,
      parseCursor(query.cursor),
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map(toHistoryUploadDto),
      nextCursor:
        hasMore && page.length > 0
          ? PrefixedId.format('historyUpload', page[page.length - 1].id)
          : null,
      hasMore,
    };
  }
}
