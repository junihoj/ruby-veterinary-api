import { IntakeSubmissionCreateDto } from '../dto/care.requests.dto';

export class CreateIntakeSubmissionCommand {
  constructor(
    readonly input: IntakeSubmissionCreateDto,
    readonly userId: string | null,
  ) {}
}
