import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { HttpException, HttpStatus } from '@nestjs/common';
import { GetServiceQuery } from '../queries/get-service.query';
import { ServiceRepository } from '../../infrastructure/repositories/service.repository';
import { ServiceDetailDto } from '../dto/clinic-content.dto';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';

@QueryHandler(GetServiceQuery)
export class GetServiceHandler implements IQueryHandler<GetServiceQuery> {
  constructor(private readonly services: ServiceRepository) {}

  async execute(query: GetServiceQuery): Promise<ServiceDetailDto> {
    const row = await this.services.findBySlug(query.slug);
    if (!row) {
      throw new HttpException(
        { code: 'RESOURCE_NOT_FOUND', message: 'Service not found.' },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      id: PrefixedId.format('service', row.id),
      name: row.name,
      slug: row.slug,
      summary: row.summary,
      descriptionMd: row.descriptionMd,
      baselinePrice: row.baselinePrice ? String(row.baselinePrice) : null,
      currency: row.currency,
      category: row.category,
      featured: row.featured,
      requiresAppointment: row.requiresAppointment,
    };
  }
}
