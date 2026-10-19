import { ClientCreateDto } from '../dto/client-records.requests.dto';

export class CreateClientCommand {
  constructor(readonly input: ClientCreateDto) {}
}
