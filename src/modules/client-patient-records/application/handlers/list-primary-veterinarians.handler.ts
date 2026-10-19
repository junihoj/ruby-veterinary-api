import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ListPrimaryVeterinariansQuery } from '../queries/list-primary-veterinarians.query';
import { toPrimaryVeterinarianLinkDto } from '../dto/client-records.mapper';
import { PrimaryVeterinarianLinkDto } from '../dto/client-records.responses.dto';
import { notFound } from '../errors';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';

/**
 * GET /admin/pets/{id}/primary-vet — current link first (effectiveTo null),
 * then superseded links. The one-current-per-pet partial unique index the
 * M5 pharmacy guardrail reads lives underneath this history.
 */
@QueryHandler(ListPrimaryVeterinariansQuery)
export class ListPrimaryVeterinariansHandler implements IQueryHandler<ListPrimaryVeterinariansQuery> {
  constructor(private readonly pets: PetRepository) {}

  async execute(
    query: ListPrimaryVeterinariansQuery,
  ): Promise<PrimaryVeterinarianLinkDto[]> {
    const uuid = PrefixedId.tryAnyToUuid(query.petId);
    if (uuid === null) throw notFound('Pet not found.');
    const pet = await this.pets.findById(uuid);
    if (!pet) throw notFound('Pet not found.');
    const rows = await this.pets.listVeterinarianLinks(pet.id);
    return rows.map(toPrimaryVeterinarianLinkDto);
  }
}
