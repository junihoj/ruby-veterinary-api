import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ListAppointmentRequestsQuery } from '../queries/list-appointment-requests.query';
import { toAppointmentRequestDto } from '../dto/care.mapper';
import { AppointmentRequestDto } from '../dto/care.responses.dto';
import { AppointmentRequestRepository } from '../../infrastructure/repositories/appointment-request.repository';

@QueryHandler(ListAppointmentRequestsQuery)
export class ListAppointmentRequestsHandler implements IQueryHandler<ListAppointmentRequestsQuery> {
  constructor(private readonly requests: AppointmentRequestRepository) {}

  async execute(query: ListAppointmentRequestsQuery): Promise<{
    data: AppointmentRequestDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const rows = await this.requests.list(
      query.status,
      query.limit,
      parseCursor(query.cursor),
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map(toAppointmentRequestDto),
      nextCursor:
        hasMore && page.length > 0
          ? PrefixedId.format('appointmentRequest', page[page.length - 1].id)
          : null,
      hasMore,
    };
  }
}
