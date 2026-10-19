import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { CreateClientCommand } from '../commands/create-client.command';
import { toClientDto } from '../dto/client-records.mapper';
import { ClientDto } from '../dto/client-records.responses.dto';
import { alreadyLinked, badRequest } from '../errors';
import { ClientRepository } from '../../infrastructure/repositories/client.repository';
import { DuplicateUserLinkError } from '../../infrastructure/errors';

/**
 * POST /admin/clients — staff file a record directly (walk-ins, imports).
 * Linking an identity account honours the one-active-client-per-user rule:
 * a second active link answers 409 ALREADY_LINKED.
 */
@CommandHandler(CreateClientCommand)
export class CreateClientHandler implements ICommandHandler<CreateClientCommand> {
  constructor(private readonly clients: ClientRepository) {}

  async execute(command: CreateClientCommand): Promise<ClientDto> {
    const rawUserId = command.input.userId ?? null;
    let userId: string | null = null;
    if (rawUserId !== null) {
      // The clients table stores raw uuids; accept usr_-prefixed ids only.
      userId = PrefixedId.tryAnyToUuid(rawUserId);
      if (userId === null) {
        throw badRequest('userId must be a valid usr_-prefixed id.');
      }
      const existing = await this.clients.findActiveByUserId(userId);
      if (existing) {
        throw alreadyLinked(
          'This account already has an active client record.',
        );
      }
    }

    try {
      const row = await this.clients.create({
        userId,
        displayName: command.input.displayName,
        email: command.input.email ?? null,
        phone: command.input.phone,
        addressLine1: command.input.addressLine1 ?? null,
        addressLine2: command.input.addressLine2 ?? null,
        city: command.input.city ?? null,
        postalCode: command.input.postalCode ?? null,
        country: command.input.country ?? null,
        preferredContact: command.input.preferredContact ?? 'phone',
        source: command.input.source,
      });
      return toClientDto(row);
    } catch (error) {
      if (error instanceof DuplicateUserLinkError) {
        throw alreadyLinked(
          'This account already has an active client record.',
        );
      }
      throw error;
    }
  }
}
