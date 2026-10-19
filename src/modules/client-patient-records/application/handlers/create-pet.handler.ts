import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { CreatePetCommand } from '../commands/create-pet.command';
import { toPetDto } from '../dto/client-records.mapper';
import { PetDto } from '../dto/client-records.responses.dto';
import { notFound } from '../errors';
import { toPetWriteFields } from '../pet-fields';
import { ClientRepository } from '../../infrastructure/repositories/client.repository';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';

/** POST /admin/clients/{id}/pets — staff adds a patient to a client. */
@CommandHandler(CreatePetCommand)
export class CreatePetHandler implements ICommandHandler<CreatePetCommand> {
  constructor(
    private readonly clients: ClientRepository,
    private readonly pets: PetRepository,
  ) {}

  async execute(command: CreatePetCommand): Promise<PetDto> {
    const clientUuid = PrefixedId.tryAnyToUuid(command.clientId);
    if (clientUuid === null) throw notFound('Client not found.');
    const client = await this.clients.findById(clientUuid);
    if (!client) throw notFound('Client not found.');

    const row = await this.pets.create(
      client.id,
      toPetWriteFields(command.input),
    );
    return toPetDto(row);
  }
}
