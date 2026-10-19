import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { GetIntakeStatusQuery } from '../queries/get-intake-status.query';
import { IntakeStatusDto } from '../dto/care.responses.dto';
import { notFound } from '../errors';
import { IntakeSubmissionRepository } from '../../infrastructure/repositories/intake-submission.repository';

/**
 * GET /clients/intake/{id}/status — Bearer, owner-scoped: a submission the
 * caller did not create answers 404 (indistinguishable from unknown ids).
 */
@QueryHandler(GetIntakeStatusQuery)
export class GetIntakeStatusHandler implements IQueryHandler<GetIntakeStatusQuery> {
  constructor(private readonly submissions: IntakeSubmissionRepository) {}

  async execute(query: GetIntakeStatusQuery): Promise<IntakeStatusDto> {
    const uuid = PrefixedId.tryAnyToUuid(query.id);
    if (uuid === null) throw notFound('Intake submission not found.');
    const row = await this.submissions.findByIdForOwner(uuid, query.userId);
    if (!row) throw notFound('Intake submission not found.');
    return {
      id: PrefixedId.format('intakeSubmission', row.id),
      status: row.status,
    };
  }
}
