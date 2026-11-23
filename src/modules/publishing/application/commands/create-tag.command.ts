import { CreateTagDto } from '../dto/publishing.requests.dto';

/** POST /tags. */
export class CreateTagCommand {
  constructor(public readonly input: CreateTagDto) {}
}
