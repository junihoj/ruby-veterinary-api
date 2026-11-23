import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreateTagCommand } from '../commands/create-tag.command';
import { toTagDto } from '../dto/publishing.mapper';
import { TagDto } from '../dto/publishing.responses.dto';
import { badRequest } from '../errors';
import { slugify } from '../slug';
import { TagRepository } from '../../infrastructure/repositories/tag.repository';

@CommandHandler(CreateTagCommand)
export class CreateTagHandler implements ICommandHandler<CreateTagCommand> {
  constructor(private readonly tags: TagRepository) {}

  async execute(command: CreateTagCommand): Promise<TagDto> {
    const input = command.input;
    const slug = input.slug ?? slugify(input.name);
    if (await this.tags.slugExists(slug)) {
      throw badRequest('Slug already in use.');
    }
    return toTagDto(await this.tags.create({ name: input.name, slug }));
  }
}
