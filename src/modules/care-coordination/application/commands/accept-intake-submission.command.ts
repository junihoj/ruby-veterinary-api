import { AcceptIntakeSubmissionDto } from '../dto/care.requests.dto';

export class AcceptIntakeSubmissionCommand {
  constructor(
    readonly id: string,
    readonly input: AcceptIntakeSubmissionDto,
  ) {}
}
