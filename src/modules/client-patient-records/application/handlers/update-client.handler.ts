import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { UpdateClientCommand } from '../commands/update-client.command';
import { toClientDto } from '../dto/client-records.mapper';
import { ClientDto } from '../dto/client-records.responses.dto';
import { notFound } from '../errors';
import { ClientRepository } from '../../infrastructure/repositories/client.repository';

/** PATCH /admin/clients/{id} — partial demographics; status toggles. */
@CommandHandler(UpdateClientCommand)
export class UpdateClientHandler implements ICommandHandler<UpdateClientCommand> {
  constructor(private readonly clients: ClientRepository) {}

  async execute(command: UpdateClientCommand): Promise<ClientDto> {
    const uuid = PrefixedId.tryAnyToUuid(command.id);
    if (uuid === null) throw notFound('Client not found.');
    const row = await this.clients.findById(uuid);
    if (!row) throw notFound('Client not found.');

    const { input } = command;
    const updated = await this.clients.update(uuid, {
      ...(input.displayName !== undefined
        ? { displayName: input.displayName }
        : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.addressLine1 !== undefined
        ? { addressLine1: input.addressLine1 }
        : {}),
      ...(input.addressLine2 !== undefined
        ? { addressLine2: input.addressLine2 }
        : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.postalCode !== undefined
        ? { postalCode: input.postalCode }
        : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.preferredContact !== undefined
        ? { preferredContact: input.preferredContact }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });
    return toClientDto(updated);
  }
}
