import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { FileIntakeCommand } from '../commands/file-intake.command';
import { toPetSummaryDto } from '../dto/client-records.mapper';
import { alreadyLinked, notFound } from '../errors';
import { FileIntakeResult } from '../facades/client-records-facade-port';
import { toPetWriteFields } from '../pet-fields';
import { ClientRepository } from '../../infrastructure/repositories/client.repository';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';
import { DuplicateUserLinkError } from '../../infrastructure/errors';

/**
 * Flow 2 filing — the only writer of intake-born clients. New-client branch:
 * client + pets in a single clients-schema transaction (never a half-filed
 * acceptance). Existing-client branch: validates the client, files the pets
 * under it. The submission-owner link (client.userId) is what makes the pets
 * reachable from commerce later (pet claim, M5).
 */
@CommandHandler(FileIntakeCommand)
export class FileIntakeHandler implements ICommandHandler<FileIntakeCommand> {
  constructor(
    private readonly clients: ClientRepository,
    private readonly pets: PetRepository,
  ) {}

  async execute(command: FileIntakeCommand): Promise<FileIntakeResult> {
    const petFields = command.pets.map(toPetWriteFields);

    if (command.clientId) {
      const uuid = PrefixedId.tryAnyToUuid(command.clientId);
      if (uuid === null) throw notFound('Client not found.');
      const client = await this.clients.findById(uuid);
      if (!client) throw notFound('Client not found.');
      const created = await this.clients.attachPets(client.id, petFields);
      return {
        clientId: PrefixedId.format('client', client.id),
        pets: created.map(toPetSummaryDto),
      };
    }

    try {
      const { client, pets } = await this.clients.createFromIntake(
        {
          userId: command.userId,
          displayName: command.client.displayName,
          email: command.client.email,
          phone: command.client.phone,
          addressLine1: command.client.addressLine1,
          addressLine2: command.client.addressLine2,
          city: command.client.city,
          postalCode: command.client.postalCode,
          country: command.client.country,
          preferredContact: 'phone',
          source: 'intake',
        },
        petFields,
      );
      return {
        clientId: PrefixedId.format('client', client.id),
        pets: pets.map(toPetSummaryDto),
      };
    } catch (error) {
      if (error instanceof DuplicateUserLinkError) {
        throw alreadyLinked(
          'This account already has an active client record — accept against it instead.',
        );
      }
      throw error;
    }
  }
}
