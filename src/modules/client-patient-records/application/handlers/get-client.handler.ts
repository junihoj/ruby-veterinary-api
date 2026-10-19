import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { GetClientQuery } from '../queries/get-client.query';
import { toClientDto, toPetDto } from '../dto/client-records.mapper';
import { ClientDto, PetDto } from '../dto/client-records.responses.dto';
import { notFound } from '../errors';
import { ClientRepository } from '../../infrastructure/repositories/client.repository';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';

/** GET /admin/clients/{id} — the client record with its pets. */
@QueryHandler(GetClientQuery)
export class GetClientHandler implements IQueryHandler<GetClientQuery> {
  constructor(
    private readonly clients: ClientRepository,
    private readonly pets: PetRepository,
  ) {}

  async execute(
    query: GetClientQuery,
  ): Promise<ClientDto & { pets: PetDto[] }> {
    const uuid = PrefixedId.tryAnyToUuid(query.id);
    if (uuid === null) throw notFound('Client not found.');
    const row = await this.clients.findById(uuid);
    if (!row) throw notFound('Client not found.');
    const petRows = await this.pets.listByClient(row.id);
    return { ...toClientDto(row), pets: petRows.map(toPetDto) };
  }
}
