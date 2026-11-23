import { UpdateCategoryDto } from '../dto/publishing.requests.dto';

/** PATCH /categories/{id}. */
export class UpdateCategoryCommand {
  constructor(
    public readonly id: string,
    public readonly input: UpdateCategoryDto,
  ) {}
}
