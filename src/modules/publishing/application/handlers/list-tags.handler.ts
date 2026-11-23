import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { toTagDto } from '../dto/publishing.mapper';
import { TagDto } from '../dto/publishing.responses.dto';
import { ListTagsQuery } from '../queries/list-tags.query';
import { TagRepository } from '../../infrastructure/repositories/tag.repository';

@QueryHandler(ListTagsQuery)
export class ListTagsHandler implements IQueryHandler<ListTagsQuery> {
  constructor(private readonly tags: TagRepository) {}

  async execute(): Promise<TagDto[]> {
    const rows = await this.tags.list();
    return rows.map(toTagDto);
  }
}
