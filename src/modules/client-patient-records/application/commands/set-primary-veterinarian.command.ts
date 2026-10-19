import { SetPrimaryVeterinarianDto } from '../dto/client-records.requests.dto';

export class SetPrimaryVeterinarianCommand {
  constructor(
    readonly petId: string,
    readonly input: SetPrimaryVeterinarianDto,
  ) {}
}
