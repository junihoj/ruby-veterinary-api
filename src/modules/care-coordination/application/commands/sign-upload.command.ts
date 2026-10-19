import { SignUploadDto } from '../dto/care.requests.dto';

export class SignUploadCommand {
  constructor(
    readonly input: SignUploadDto,
    /** Bearer — sign is authenticated, so this is always set. */
    readonly userId: string,
  ) {}
}
