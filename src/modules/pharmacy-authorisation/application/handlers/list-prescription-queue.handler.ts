import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { parseCursor } from '../../../../shared/cross-cutting/pagination';
import { ClientRecordsFacadePort } from '../../../client-patient-records/application/facades/client-records-facade-port';
import { GetClientQuery } from '../../../client-patient-records/application/queries/get-client.query';
import { GetPetQuery } from '../../../client-patient-records/application/queries/get-pet.query';
import { ListPrescriptionQueueQuery } from '../queries/list-prescription-queue.query';
import { toPrescriptionRequestDto } from '../dto/pharmacy.mapper';
import {
  PagedResult,
  PrescriptionQueueItemDto,
} from '../dto/pharmacy.responses.dto';
import { PrescriptionRequestRepository } from '../../infrastructure/repositories/prescription-request.repository';

/**
 * GET /prescriptions/queue — staff review queue (`rx:review`): open states
 * (`pending`, `queried` — or both when unfiltered), newest first. Pet and
 * client display names are enriched through the ClientRecords facade port
 * (never a cross-schema read, §10 rule 5); a deleted pet degrades to a
 * nameless row rather than failing the queue.
 */
@QueryHandler(ListPrescriptionQueueQuery)
export class ListPrescriptionQueueHandler implements IQueryHandler<ListPrescriptionQueueQuery> {
  constructor(
    private readonly requests: PrescriptionRequestRepository,
    private readonly clientRecords: ClientRecordsFacadePort,
  ) {}

  async execute(
    query: ListPrescriptionQueueQuery,
  ): Promise<PagedResult<PrescriptionQueueItemDto>> {
    const cursor = parseCursor(query.cursor ?? undefined);
    const rows = await this.requests.listOpen(
      query.status,
      query.limit,
      cursor ?? undefined,
    );
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    const data: PrescriptionQueueItemDto[] = [];
    for (const row of page) {
      const item: PrescriptionQueueItemDto = {
        ...toPrescriptionRequestDto(row),
      };
      try {
        const pet = await this.clientRecords.getPet(
          new GetPetQuery(PrefixedId.format('pet', row.petId)),
        );
        item.petName = pet.name;
        const client = await this.clientRecords.getClient(
          new GetClientQuery(pet.clientId),
        );
        item.clientName = client.displayName;
      } catch {
        // Deleted records degrade to unnamed rows — the queue stays usable.
      }
      data.push(item);
    }

    return {
      data,
      nextCursor:
        hasMore && page.length > 0
          ? PrefixedId.format('prescriptionRequest', page[page.length - 1].id)
          : null,
      hasMore,
    };
  }
}
