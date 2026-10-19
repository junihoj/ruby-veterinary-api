import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ListIntakeSubmissionsQuery } from '../queries/list-intake-submissions.query';
import { toIntakeSubmissionDto } from '../dto/care.mapper';
import { IntakeSubmissionDto } from '../dto/care.responses.dto';
import { IntakeSubmissionRepository } from '../../infrastructure/repositories/intake-submission.repository';

@QueryHandler(ListIntakeSubmissionsQuery)
export class ListIntakeSubmissionsHandler implements IQueryHandler<ListIntakeSubmissionsQuery> {
  constructor(private readonly submissions: IntakeSubmissionRepository) {}

  async execute(query: ListIntakeSubmissionsQuery): Promise<{
    data: IntakeSubmissionDto[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const rows = await this.submissions.list(
      query.status,
      query.limit,
      parseCursor(query.cursor),
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      data: page.map(toIntakeSubmissionDto),
      nextCursor:
        hasMore && page.length > 0
          ? PrefixedId.format('intakeSubmission', page[page.length - 1].id)
          : null,
      hasMore,
    };
  }
}
