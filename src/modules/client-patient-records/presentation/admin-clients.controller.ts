import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { toLimit } from '../../../shared/cross-cutting/pagination';
import { Requires } from '../../../shared/cross-cutting/decorators';
import { CreateClientCommand } from '../application/commands/create-client.command';
import { CreatePetCommand } from '../application/commands/create-pet.command';
import { UpdateClientCommand } from '../application/commands/update-client.command';
import {
  ClientCreateDto,
  ClientUpdateDto,
  PetCreateDto,
} from '../application/dto/client-records.requests.dto';
import {
  ClientDto,
  PetDto,
} from '../application/dto/client-records.responses.dto';
import { ClientRecordsFacadePort } from '../application/facades/client-records-facade-port';
import { GetClientQuery } from '../application/queries/get-client.query';
import { ListClientPetsQuery } from '../application/queries/list-client-pets.query';
import { ListClientsQuery } from '../application/queries/list-clients.query';

/**
 * Staff client roster (client-records.yaml) — care:write. The static intake
 * queue path /admin/clients/intake is registered by Care Coordination, which
 * AppModule imports first, so it wins Express matching over this controller's
 * GET :id (verified by the care-path e2e suite).
 */
@Controller('admin/clients')
@ApiTags('Client & Patient Records')
@ApiBearerAuth()
@Requires({ permissions: ['care:write'] })
export class AdminClientsController {
  constructor(private readonly records: ClientRecordsFacadePort) {}

  @Get()
  @ApiOperation({
    operationId: 'listClients',
    summary: 'Staff client roster (deletion-aware)',
  })
  @ApiOkResponse({ description: 'Client page, newest first.' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'active | inactive',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    description: 'Case-insensitive displayName/phone search',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '1–100, default 20',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    description: 'cli_… page cursor',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  async listClients(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{
    data: ClientDto[];
    meta: {
      pagination: { limit: number; cursor: string | null; hasMore: boolean };
    };
  }> {
    const pageLimit = toLimit(limit);
    const result = await this.records.listClients(
      new ListClientsQuery(status ?? null, q ?? null, pageLimit, cursor),
    );
    return {
      data: result.data,
      meta: {
        pagination: {
          limit: pageLimit,
          cursor: result.nextCursor,
          hasMore: result.hasMore,
        },
      },
    };
  }

  @Post()
  @ApiOperation({
    operationId: 'createClient',
    summary: 'File a client record directly (walk-ins, imports)',
  })
  @ApiCreatedResponse({ description: 'Client created — cli_… id.' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiConflictResponse({
    description:
      'ALREADY_LINKED — the linked account already has an active client.',
  })
  createClient(@Body() body: ClientCreateDto): Promise<ClientDto> {
    return this.records.createClient(new CreateClientCommand(body));
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'getClient',
    summary: 'Client record with its pets',
  })
  @ApiOkResponse({ description: 'Client + pets (deceased included).' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown client.' })
  getClient(@Param('id') id: string): Promise<ClientDto & { pets: PetDto[] }> {
    return this.records.getClient(new GetClientQuery(id));
  }

  @Patch(':id')
  @ApiOperation({
    operationId: 'updateClient',
    summary: 'Update client demographics or status',
  })
  @ApiOkResponse({ description: 'Updated client.' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown client.' })
  updateClient(
    @Param('id') id: string,
    @Body() body: ClientUpdateDto,
  ): Promise<ClientDto> {
    return this.records.updateClient(new UpdateClientCommand(id, body));
  }

  @Get(':id/pets')
  @ApiOperation({
    operationId: 'listClientPets',
    summary: 'Pets of a client (deceased included, deleted excluded)',
  })
  @ApiOkResponse({ description: 'Pet detail page for the client.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown client.' })
  listClientPets(@Param('id') id: string): Promise<PetDto[]> {
    return this.records.listClientPets(new ListClientPetsQuery(id));
  }

  @Post(':id/pets')
  @ApiOperation({
    operationId: 'createPet',
    summary: 'Add a patient to a client',
  })
  @ApiCreatedResponse({ description: 'Pet created — pet_… id.' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown client.' })
  createPet(
    @Param('id') id: string,
    @Body() body: PetCreateDto,
  ): Promise<PetDto> {
    return this.records.createPet(new CreatePetCommand(id, body));
  }
}
