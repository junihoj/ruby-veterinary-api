import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Prisma } from '../../../../generated/prisma/client';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { UpdateCategoryCommand } from '../commands/update-category.command';
import { toCategoryDto } from '../dto/publishing.mapper';
import { CategoryDto } from '../dto/publishing.responses.dto';
import { badRequest, notFound } from '../errors';
import { CategoryRepository } from '../../infrastructure/repositories/category.repository';

@CommandHandler(UpdateCategoryCommand)
export class UpdateCategoryHandler implements ICommandHandler<UpdateCategoryCommand> {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(command: UpdateCategoryCommand): Promise<CategoryDto> {
    const id = PrefixedId.tryAnyToUuid(command.id);
    if (!id) throw notFound('Category not found.');
    const existing = await this.categories.findById(id);
    if (!existing) throw notFound('Category not found.');

    const input = command.input;
    if (
      input.slug !== undefined &&
      (await this.categories.slugExists(input.slug, id))
    ) {
      throw badRequest('Slug already in use.');
    }

    const data: Prisma.CategoryUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.description !== undefined) data.description = input.description;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    return toCategoryDto(await this.categories.update(id, data));
  }
}
