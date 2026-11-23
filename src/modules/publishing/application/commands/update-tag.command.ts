import { UpdateTagDto } from '../dto/publishing.requests.dto';

/** PATCH /tags/{id}. */
export class UpdateTagCommand {
  constructor(
    public readonly id: string,
    public readonly input: UpdateTagDto,
  ) {}
}
