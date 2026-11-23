import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '../../../../generated/prisma/client';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { UpdateTagCommand } from '../commands/update-tag.command';
import { toTagDto } from '../dto/publishing.mapper';
import { TagDto } from '../dto/publishing.responses.dto';
import { badRequest, notFound } from '../errors';
import { TagRepository } from '../../infrastructure/repositories/tag.repository';

@CommandHandler(UpdateTagCommand)
export class UpdateTagHandler implements ICommandHandler<UpdateTagCommand> {
  constructor(private readonly tags: TagRepository) {}

  async execute(command: UpdateTagCommand): Promise<TagDto> {
    const id = PrefixedId.tryAnyToUuid(command.id);
    if (!id) throw notFound('Tag not found.');
    const existing = await this.tags.findById(id);
    if (!existing) throw notFound('Tag not found.');

    const input = command.input;
    if (
      input.slug !== undefined &&
      (await this.tags.slugExists(input.slug, id))
    ) {
      throw badRequest('Slug already in use.');
    }

    const data: Prisma.TagUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;

    return toTagDto(await this.tags.update(id, data));
  }
}
