import { ClientUpdateDto } from '../dto/client-records.requests.dto';

export class UpdateClientCommand {
  constructor(
    readonly id: string,
    readonly input: ClientUpdateDto,
  ) {}
}
