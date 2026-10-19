import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { GetPetQuery } from '../queries/get-pet.query';
import { toPetDto } from '../dto/client-records.mapper';
import { PetDto } from '../dto/client-records.responses.dto';
import { notFound } from '../errors';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';

/**
 * GET /admin/pets/{id} — the same query the facade port exposes to other
 * contexts (commerce pet prefill / M5 pet claim consume it via the port).
 * Unknown or deleted pets answer 404.
 */
@QueryHandler(GetPetQuery)
export class GetPetHandler implements IQueryHandler<GetPetQuery> {
  constructor(private readonly pets: PetRepository) {}

  async execute(query: GetPetQuery): Promise<PetDto> {
    const uuid = PrefixedId.tryAnyToUuid(query.id);
    if (uuid === null) throw notFound('Pet not found.');
    const row = await this.pets.findById(uuid);
    if (!row) throw notFound('Pet not found.');
    return toPetDto(row);
  }
}
