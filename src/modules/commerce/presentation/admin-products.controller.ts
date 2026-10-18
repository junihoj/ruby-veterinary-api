import {
  Body,
  Controller,
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  Requires,
} from '../../../shared/cross-cutting/decorators';
import type { AuthUser } from '../../../shared/cross-cutting/decorators';
import { AdminCreateProductCommand } from '../application/commands/admin-create-product.command';
import { AdminCreateDownloadFileCommand } from '../application/commands/admin-create-download-file.command';
import { AdminUpdateProductCommand } from '../application/commands/admin-update-product.command';
import { CommerceFacadePort } from '../application/facades/commerce-facade-port';
import {
  AdminCreateDownloadFileDto,
  AdminCreateProductDto,
  AdminUpdateProductDto,
} from '../application/dto/commerce.requests.dto';
import {
  DownloadFileUploadDto,
  ProductDetailDto,
} from '../application/dto/commerce.responses.dto';

/**
 * Admin catalog CRUD (commerce.yaml Catalog admin). `catalog:write` is held
 * by practice_manager only (role-permissions, shop-manager parity).
 */
@Controller('admin/products')
@ApiTags('Catalog')
@ApiBearerAuth()
@Requires({ permissions: ['catalog:write'] })
export class AdminProductsController {
  constructor(private readonly commerce: CommerceFacadePort) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'adminCreateProduct',
    summary: 'Create a draft product of one of seven shapes',
  })
  @ApiCreatedResponse({ description: 'Created (draft unless published).' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing catalog:write.' })
  createProduct(
    @CurrentUser() _user: AuthUser,
    @Body() body: AdminCreateProductDto,
  ): Promise<ProductDetailDto> {
    return this.commerce.adminCreateProduct(
      new AdminCreateProductCommand(body),
    );
  }

  @Patch(':id')
  @ApiOperation({
    operationId: 'adminUpdateProduct',
    summary: 'Partial product or variant update (stock/price maintenance)',
  })
  @ApiOkResponse({ description: 'Updated product.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing catalog:write.' })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown product or variant.',
  })
  updateProduct(
    @CurrentUser() _user: AuthUser,
    @Param('id') id: string,
    @Body() body: AdminUpdateProductDto,
  ): Promise<ProductDetailDto> {
    return this.commerce.adminUpdateProduct(
      new AdminUpdateProductCommand(id, body),
    );
  }

  @Post(':id/download-files')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'adminCreateDownloadFile',
    summary: 'Create a downloadable file record + presigned PUT upload URL',
  })
  @ApiCreatedResponse({
    description:
      'File record created; data carries the DownloadFile and a short-lived presigned PUT uploadUrl.',
  })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED.' })
  @ApiUnauthorizedResponse({
    description: 'INVALID_CREDENTIALS or TOKEN_EXPIRED.',
  })
  @ApiForbiddenResponse({ description: 'STAFF_ONLY — missing catalog:write.' })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND — unknown product.',
  })
  createDownloadFile(
    @CurrentUser() _user: AuthUser,
    @Param('id') id: string,
    @Body() body: AdminCreateDownloadFileDto,
  ): Promise<DownloadFileUploadDto> {
    return this.commerce.adminCreateDownloadFile(
      new AdminCreateDownloadFileCommand(id, body),
    );
  }
}
