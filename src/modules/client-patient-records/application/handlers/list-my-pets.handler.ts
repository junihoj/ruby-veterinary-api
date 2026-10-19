import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ListMyPetsQuery } from '../queries/list-my-pets.query';
import { toPetSummaryDto } from '../dto/client-records.mapper';
import { PetSummaryDto } from '../dto/client-records.responses.dto';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';

/**
 * GET /pets — the caller's pets (pet-claim surface for commerce prefill).
 * An owner with no (non-deleted) client record gets an empty list rather
 * than an error: intake is their first step.
 */
@QueryHandler(ListMyPetsQuery)
export class ListMyPetsHandler implements IQueryHandler<ListMyPetsQuery> {
  constructor(private readonly pets: PetRepository) {}

  async execute(query: ListMyPetsQuery): Promise<PetSummaryDto[]> {
    const rows = await this.pets.listByOwnerUserId(query.userId);
    return rows.map(toPetSummaryDto);
  }
}
