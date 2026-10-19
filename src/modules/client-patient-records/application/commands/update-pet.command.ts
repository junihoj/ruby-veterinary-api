import { PetUpdateDto } from '../dto/client-records.requests.dto';

export class UpdatePetCommand {
  constructor(
    readonly id: string,
    readonly input: PetUpdateDto,
  ) {}
}
