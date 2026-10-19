import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { UpdatePetCommand } from '../commands/update-pet.command';
import { toPetDto } from '../dto/client-records.mapper';
import { PetDto } from '../dto/client-records.responses.dto';
import { notFound } from '../errors';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';

/**
 * PATCH /admin/pets/{id} — partial demographics; `status: deceased` keeps
 * history queryable while blocking future claims without staff override.
 */
@CommandHandler(UpdatePetCommand)
export class UpdatePetHandler implements ICommandHandler<UpdatePetCommand> {
  constructor(private readonly pets: PetRepository) {}

  async execute(command: UpdatePetCommand): Promise<PetDto> {
    const uuid = PrefixedId.tryAnyToUuid(command.id);
    if (uuid === null) throw notFound('Pet not found.');
    const row = await this.pets.findById(uuid);
    if (!row) throw notFound('Pet not found.');

    const { input } = command;
    const updated = await this.pets.update(uuid, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.species !== undefined ? { species: input.species } : {}),
      ...(input.breed !== undefined ? { breed: input.breed } : {}),
      ...(input.sex !== undefined ? { sex: input.sex } : {}),
      ...(input.neutered !== undefined ? { neutered: input.neutered } : {}),
      ...(input.dateOfBirth !== undefined
        ? {
            dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          }
        : {}),
      ...(input.weightKg !== undefined ? { weightKg: input.weightKg } : {}),
      ...(input.microchipId !== undefined
        ? { microchipId: input.microchipId }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });
    return toPetDto(updated);
  }
}
