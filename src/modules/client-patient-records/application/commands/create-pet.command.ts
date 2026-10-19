import { PetCreateDto } from '../dto/client-records.requests.dto';

export class CreatePetCommand {
  constructor(
    readonly clientId: string,
    readonly input: PetCreateDto,
  ) {}
}
