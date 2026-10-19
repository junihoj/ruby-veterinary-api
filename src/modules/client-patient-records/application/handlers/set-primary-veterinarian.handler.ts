import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IdentityFacadePort } from '../../../identity/application/facades/identity-facade-port';
import { SetPrimaryVeterinarianCommand } from '../commands/set-primary-veterinarian.command';
import { toPrimaryVeterinarianLinkDto } from '../dto/client-records.mapper';
import { PrimaryVeterinarianLinkDto } from '../dto/client-records.responses.dto';
import { notFound, notVeterinarian } from '../errors';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';

/**
 * POST /admin/pets/{id}/primary-vet — starts a new current link and closes
 * the previous one in the same transaction, preserving the
 * one-current-per-pet partial unique index (M5 pharmacy guardrail). The
 * target is resolved through the identity port (port-owned cross-context
 * read): unknown user → 404, non-veterinarian → 422 NOT_A_VETERINARIAN.
 */
@CommandHandler(SetPrimaryVeterinarianCommand)
export class SetPrimaryVeterinarianHandler implements ICommandHandler<SetPrimaryVeterinarianCommand> {
  constructor(
    private readonly pets: PetRepository,
    private readonly identity: IdentityFacadePort,
  ) {}

  async execute(
    command: SetPrimaryVeterinarianCommand,
  ): Promise<PrimaryVeterinarianLinkDto> {
    const petUuid = PrefixedId.tryAnyToUuid(command.petId);
    if (petUuid === null) throw notFound('Pet not found.');
    const pet = await this.pets.findById(petUuid);
    if (!pet) throw notFound('Pet not found.');

    const vetUuid = PrefixedId.tryAnyToUuid(command.input.veterinarianUserId);
    if (vetUuid === null) throw notFound('Veterinarian not found.');
    const vetUser = await this.identity.getUserById(vetUuid);
    if (!vetUser) throw notFound('Veterinarian not found.');
    const roles = await this.identity.resolveRoles(vetUuid);
    if (!roles.includes('veterinarian')) {
      throw notVeterinarian(
        'The selected user does not hold the veterinarian role.',
      );
    }

    const effectiveFrom = command.input.effectiveFrom
      ? new Date(command.input.effectiveFrom)
      : new Date();
    const link = await this.pets.setPrimaryVeterinarian(
      pet.id,
      vetUuid,
      effectiveFrom,
    );
    return toPrimaryVeterinarianLinkDto(link);
  }
}
