import { CreateCategoryDto } from '../dto/publishing.requests.dto';

/** POST /categories. */
export class CreateCategoryCommand {
  constructor(public readonly input: CreateCategoryDto) {}
}
