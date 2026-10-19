import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ListMedicalHistoryQuery } from '../queries/list-medical-history.query';
import { toMedicalHistoryRecordDto } from '../dto/client-records.mapper';
import { MedicalHistoryRecordDto } from '../dto/client-records.responses.dto';
import { notFound } from '../errors';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';

/** GET /admin/pets/{id}/medical-history — reference objects, newest first. */
@QueryHandler(ListMedicalHistoryQuery)
export class ListMedicalHistoryHandler implements IQueryHandler<ListMedicalHistoryQuery> {
  constructor(private readonly pets: PetRepository) {}

  async execute(
    query: ListMedicalHistoryQuery,
  ): Promise<MedicalHistoryRecordDto[]> {
    const uuid = PrefixedId.tryAnyToUuid(query.petId);
    if (uuid === null) throw notFound('Pet not found.');
    const pet = await this.pets.findById(uuid);
    if (!pet) throw notFound('Pet not found.');
    const rows = await this.pets.listHistory(pet.id);
    return rows.map(toMedicalHistoryRecordDto);
  }
}
