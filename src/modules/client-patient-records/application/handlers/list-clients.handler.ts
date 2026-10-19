import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ListClientsQuery } from '../queries/list-clients.query';
import { toClientDto } from '../dto/client-records.mapper';
import { ClientDto } from '../dto/client-records.responses.dto';
import { ClientRepository } from '../../infrastructure/repositories/client.repository';

@QueryHandler(ListClientsQuery)
export class ListClientsHandler implements IQueryHandler<ListClientsQuery> {
  constructor(private readonly clients: ClientRepository) {}

  async execute(query: ListClientsQuery): Promise<{
    data: ClientDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const rows = await this.clients.list(
      query.status,
      query.q,
      query.limit,
      parseCursor(query.cursor),
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map(toClientDto),
      nextCursor:
        hasMore && page.length > 0
          ? PrefixedId.format('client', page[page.length - 1].id)
          : null,
      hasMore,
    };
  }
}
