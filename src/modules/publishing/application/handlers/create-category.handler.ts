import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { CreateCategoryCommand } from '../commands/create-category.command';
import { toCategoryDto } from '../dto/publishing.mapper';
import { CategoryDto } from '../dto/publishing.responses.dto';
import { badRequest } from '../errors';
import { slugify } from '../slug';
import { CategoryRepository } from '../../infrastructure/repositories/category.repository';

@CommandHandler(CreateCategoryCommand)
export class CreateCategoryHandler implements ICommandHandler<CreateCategoryCommand> {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(command: CreateCategoryCommand): Promise<CategoryDto> {
    const input = command.input;
    const slug = input.slug ?? slugify(input.name);
    if (await this.categories.slugExists(slug)) {
      throw badRequest('Slug already in use.');
    }
    const row = await this.categories.create({
      name: input.name,
      slug,
      description: input.description ?? null,
    });
    return toCategoryDto(row);
  }
}
