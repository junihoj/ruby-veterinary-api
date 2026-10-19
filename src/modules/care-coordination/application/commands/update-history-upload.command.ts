import { UpdateHistoryUploadDto } from '../dto/care.requests.dto';

export class UpdateHistoryUploadCommand {
  constructor(
    readonly id: string,
    readonly input: UpdateHistoryUploadDto,
  ) {}
}
