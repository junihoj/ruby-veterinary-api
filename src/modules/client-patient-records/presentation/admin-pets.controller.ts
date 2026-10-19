import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Requires } from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { CurrentUser } from '../../../shared/cross-cutting/decorators';
import { CreateMedicalHistoryRecordCommand } from '../application/commands/create-medical-history-record.command';
import { SetPrimaryVeterinarianCommand } from '../application/commands/set-primary-veterinarian.command';
import { UpdatePetCommand } from '../application/commands/update-pet.command';
import {
  MedicalHistoryCreateDto,
  PetUpdateDto,
  SetPrimaryVeterinarianDto,
} from '../application/dto/client-records.requests.dto';
import {
  MedicalHistoryRecordDto,
  MedicalHistoryRecordUploadDto,
  PetDto,
  PrimaryVeterinarianLinkDto,
} from '../application/dto/client-records.responses.dto';
import { ClientRecordsFacadePort } from '../application/facades/client-records-facade-port';
import { GetPetQuery } from '../application/queries/get-pet.query';
import { ListMedicalHistoryQuery } from '../application/queries/list-medical-history.query';
import { ListPrimaryVeterinariansQuery } from '../application/queries/list-primary-veterinarians.query';

/**
 * Staff patient surface (client-records.yaml) — care:write. Medical history
 * is reference records + presigned uploads (ADR-0016); primary-vet links are
 * supersession records whose current link guards M5 dispensing.
 */
@Controller('admin/pets')
@ApiTags('Client & Patient Records')
@ApiBearerAuth()
@Requires({ permissions: ['care:write'] })
export class AdminPetsController {
  constructor(private readonly records: ClientRecordsFacadePort) {}

  @Get(':id')
  @ApiOperation({ operationId: 'getPet', summary: 'Patient detail' })
  @ApiOkResponse({ description: 'Pet detail.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown pet.' })
  getPet(@Param('id') id: string): Promise<PetDto> {
    return this.records.getPet(new GetPetQuery(id));
  }

  @Patch(':id')
  @ApiOperation({
    operationId: 'updatePet',
    summary: 'Update patient demographics or status',
  })
  @ApiOkResponse({
    description: 'Updated pet — status deceased keeps history queryable.',
  })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown pet.' })
  updatePet(
    @Param('id') id: string,
    @Body() body: PetUpdateDto,
  ): Promise<PetDto> {
    return this.records.updatePet(new UpdatePetCommand(id, body));
  }

  @Get(':id/medical-history')
  @ApiOperation({
    operationId: 'listMedicalHistory',
    summary: 'Medical history records (reference objects, newest first)',
  })
  @ApiOkResponse({ description: 'Records without file bodies or URLs.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown pet.' })
  listMedicalHistory(
    @Param('id') id: string,
  ): Promise<MedicalHistoryRecordDto[]> {
    return this.records.listMedicalHistory(new ListMedicalHistoryQuery(id));
  }

  @Post(':id/medical-history')
  @ApiOperation({
    operationId: 'createMedicalHistoryRecord',
    summary: 'Create a record and get a presigned upload PUT',
  })
  @ApiCreatedResponse({
    description: 'Record created (pending) with presigned SeaweedFS PUT.',
  })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown pet.' })
  @ApiPayloadTooLargeResponse({
    description: 'UPLOAD_TOO_LARGE — over the 10 MB cap.',
  })
  createMedicalHistoryRecord(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: MedicalHistoryCreateDto,
  ): Promise<MedicalHistoryRecordUploadDto> {
    return this.records.createMedicalHistoryRecord(
      new CreateMedicalHistoryRecordCommand(id, body, user.id),
    );
  }

  @Get(':id/primary-vet')
  @ApiOperation({
    operationId: 'listPrimaryVeterinarians',
    summary: 'Primary-veterinarian link history (current first)',
  })
  @ApiOkResponse({
    description: 'Links, current (effectiveTo null) first.',
  })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND — unknown pet.' })
  listPrimaryVeterinarians(
    @Param('id') id: string,
  ): Promise<PrimaryVeterinarianLinkDto[]> {
    return this.records.listPrimaryVeterinarians(
      new ListPrimaryVeterinariansQuery(id),
    );
  }

  @Post(':id/primary-vet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'setPrimaryVeterinarian',
    summary: 'Set the current primary veterinarian (closes the previous link)',
  })
  @ApiOkResponse({
    description: 'New current link; the previous link gains effectiveTo.',
  })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing care:write.' })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown pet or user.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'NOT_A_VETERINARIAN — target lacks the veterinarian role.',
  })
  setPrimaryVeterinarian(
    @Param('id') id: string,
    @Body() body: SetPrimaryVeterinarianDto,
  ): Promise<PrimaryVeterinarianLinkDto> {
    return this.records.setPrimaryVeterinarian(
      new SetPrimaryVeterinarianCommand(id, body),
    );
  }
}
