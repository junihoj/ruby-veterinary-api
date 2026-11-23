import { UpdateArticleDto } from '../dto/publishing.requests.dto';

/** PATCH /articles/{id} — partial edit, including status transitions. */
export class UpdateArticleCommand {
  constructor(
    public readonly id: string,
    public readonly input: UpdateArticleDto,
  ) {}
}
