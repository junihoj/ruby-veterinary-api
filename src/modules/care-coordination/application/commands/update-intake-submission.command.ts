import { UpdateIntakeSubmissionDto } from '../dto/care.requests.dto';

export class UpdateIntakeSubmissionCommand {
  constructor(
    readonly id: string,
    readonly input: UpdateIntakeSubmissionDto,
  ) {}
}
