import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../../shared/cross-cutting/decorators';
import { ClinicContentFacadePort } from '../application/facades/clinic-content-facade-port';
import { GetClinicContactQuery } from '../application/queries/get-clinic-contact.query';
import { GetClinicHoursQuery } from '../application/queries/get-clinic-hours.query';
import { GetDocumentDownloadQuery } from '../application/queries/get-document-download.query';
import { GetServiceQuery } from '../application/queries/get-service.query';
import { ListDocumentsQuery } from '../application/queries/list-documents.query';
import { ListServicesQuery } from '../application/queries/list-services.query';
import { ListStaffQuery } from '../application/queries/list-staff.query';
import {
  ClinicContactDto,
  ClinicHoursDto,
  DocumentDownloadDto,
  DocumentSummaryDto,
  ServiceDetailDto,
  ServiceSummaryDto,
  StaffProfileDto,
} from '../application/dto/clinic-content.dto';

/**
 * Clinic Content API (clinic-content.yaml) — seven sessionless public reads.
 * Every route is @Public and answers `Cache-Control: public, max-age=60`
 * (api-specification.md cache policy; CDN edge does the heavy caching).
 */
@ApiTags('clinic')
@Public()
@Controller()
export class ClinicContentController {
  constructor(private readonly clinicContent: ClinicContentFacadePort) {}

  /**
   * Contract limit (clinic-content.yaml LimitParam): 1..100, default 20.
   * Anything non-numeric falls back to the default instead of failing.
   */
  private toLimit(raw?: string): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 20;
    return Math.min(100, Math.max(1, Math.trunc(n)));
  }

  @Get('clinic/hours')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    operationId: 'getClinicHours',
    summary: 'Standard and holiday hours plus open-now state',
  })
  @ApiOkResponse({ description: 'Hours' })
  async hours(): Promise<ClinicHoursDto> {
    return this.clinicContent.getClinicHours(new GetClinicHoursQuery());
  }

  @Get('clinic/contact')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    operationId: 'getClinicContact',
    summary: 'Phone, address, emergency numbers',
  })
  @ApiOkResponse({ description: 'Contact block' })
  async contact(): Promise<ClinicContactDto> {
    return this.clinicContent.getClinicContact(new GetClinicContactQuery());
  }

  @Get('services')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    operationId: 'listServices',
    summary: 'Service catalog with baseline pricing',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiOkResponse({ description: 'Published services' })
  async services(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{
    data: ServiceSummaryDto[];
    meta: {
      pagination: { limit: number; cursor: string | null; hasMore: boolean };
    };
  }> {
    const pageLimit = this.toLimit(limit);
    const result = await this.clinicContent.listServices(
      new ListServicesQuery(pageLimit, cursor),
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

  @Get('services/:slug')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ operationId: 'getService', summary: 'Single service page' })
  @ApiOkResponse({ description: 'Service' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND' })
  async service(@Param('slug') slug: string): Promise<ServiceDetailDto> {
    return this.clinicContent.getService(new GetServiceQuery(slug));
  }

  @Get('staff')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    operationId: 'listStaff',
    summary: 'Published staff profiles',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ description: 'Staff grid' })
  async staff(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{
    data: StaffProfileDto[];
    meta: {
      pagination: { limit: number; cursor: string | null; hasMore: boolean };
    };
  }> {
    const pageLimit = this.toLimit(limit);
    const result = await this.clinicContent.listStaff(
      new ListStaffQuery(pageLimit, cursor),
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

  @Get('documents')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    operationId: 'listDocuments',
    summary: 'Downloadable care documents index',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ description: 'Published documents' })
  async documents(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<{
    data: DocumentSummaryDto[];
    meta: {
      pagination: { limit: number; cursor: string | null; hasMore: boolean };
    };
  }> {
    const pageLimit = this.toLimit(limit);
    const result = await this.clinicContent.listDocuments(
      new ListDocumentsQuery(pageLimit, cursor),
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

  @Get('documents/:id')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({
    operationId: 'getDocumentDownload',
    summary: 'Signed download link for a care document',
  })
  @ApiOkResponse({ description: 'Signed URL payload' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND' })
  async documentDownload(
    @Param('id') id: string,
  ): Promise<DocumentDownloadDto> {
    return this.clinicContent.getDocumentDownload(
      new GetDocumentDownloadQuery(id),
    );
  }
}
