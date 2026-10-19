import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ListClientPetsQuery } from '../queries/list-client-pets.query';
import { toPetDto } from '../dto/client-records.mapper';
import { PetDto } from '../dto/client-records.responses.dto';
import { notFound } from '../errors';
import { ClientRepository } from '../../infrastructure/repositories/client.repository';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';

/** GET /admin/clients/{id}/pets — deceased included, deleted excluded. */
@QueryHandler(ListClientPetsQuery)
export class ListClientPetsHandler implements IQueryHandler<ListClientPetsQuery> {
  constructor(
    private readonly clients: ClientRepository,
    private readonly pets: PetRepository,
  ) {}

  async execute(query: ListClientPetsQuery): Promise<PetDto[]> {
    const uuid = PrefixedId.tryAnyToUuid(query.clientId);
    if (uuid === null) throw notFound('Client not found.');
    const client = await this.clients.findById(uuid);
    if (!client) throw notFound('Client not found.');
    const rows = await this.pets.listByClient(client.id);
    return rows.map(toPetDto);
  }
}
