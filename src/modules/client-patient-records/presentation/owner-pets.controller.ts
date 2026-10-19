import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { ListMyPetsQuery } from '../application/queries/list-my-pets.query';
import { PetSummaryDto } from '../application/dto/client-records.responses.dto';
import { ClientRecordsFacadePort } from '../application/facades/client-records-facade-port';

/**
 * Pet-claim surface for owners (client-records.yaml GET /pets). An owner
 * without a client record gets an empty list; the Rx claim enforcement that
 * consumes this arrives with M5 (M4 ships the read + user-linked clients).
 */
@Controller('pets')
@ApiTags('Client & Patient Records')
@ApiBearerAuth()
export class OwnerPetsController {
  constructor(private readonly records: ClientRecordsFacadePort) {}

  @Get()
  @ApiOperation({
    operationId: 'listMyPets',
    summary: 'Pets linked to the caller’s client record',
  })
  @ApiOkResponse({
    description:
      'Pet summaries (id, name, species, breed?, status); empty when no client record yet.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  listMyPets(@CurrentUser() user: AuthUser): Promise<PetSummaryDto[]> {
    return this.records.listMyPets(new ListMyPetsQuery(user.id));
  }
}
