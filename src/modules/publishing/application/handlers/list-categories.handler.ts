import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { toCategoryDto } from '../dto/publishing.mapper';
import { CategoryDto } from '../dto/publishing.responses.dto';
import { ListCategoriesQuery } from '../queries/list-categories.query';
import { CategoryRepository } from '../../infrastructure/repositories/category.repository';

@QueryHandler(ListCategoriesQuery)
export class ListCategoriesHandler implements IQueryHandler<ListCategoriesQuery> {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(): Promise<CategoryDto[]> {
    const rows = await this.categories.list();
    return rows.map(toCategoryDto);
  }
}
