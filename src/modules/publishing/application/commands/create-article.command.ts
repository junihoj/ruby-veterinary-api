import { CreateArticleDto } from '../dto/publishing.requests.dto';

/** POST /articles — create a draft; the acting user is the default author. */
export class CreateArticleCommand {
  constructor(
    public readonly input: CreateArticleDto,
    public readonly userId: string,
  ) {}
}
