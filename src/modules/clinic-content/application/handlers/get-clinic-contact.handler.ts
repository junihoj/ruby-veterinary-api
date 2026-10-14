import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { HttpException, HttpStatus } from '@nestjs/common';
import { GetClinicContactQuery } from '../queries/get-clinic-contact.query';
import { ClinicRepository } from '../../infrastructure/repositories/clinic.repository';
import { ClinicContactDto } from '../dto/clinic-content.dto';

@QueryHandler(GetClinicContactQuery)
export class GetClinicContactHandler implements IQueryHandler<GetClinicContactQuery> {
  constructor(private readonly clinics: ClinicRepository) {}

  async execute(query: GetClinicContactQuery): Promise<ClinicContactDto> {
    void query;
    const clinic = await this.clinics.findClinic();
    if (!clinic) {
      throw new HttpException(
        { code: 'RESOURCE_NOT_FOUND', message: 'Clinic not found.' },
        HttpStatus.NOT_FOUND,
      );
    }

    return {
      name: clinic.name,
      address: {
        line1: clinic.addressLine1,
        line2: clinic.addressLine2,
        city: clinic.city,
        region: clinic.region,
        postalCode: clinic.postalCode,
        country: clinic.country,
      },
      mainPhone: clinic.mainPhone,
      emergencyPhone: clinic.emergencyPhone,
      whatsappDisplay: clinic.whatsappDisplay,
    };
  }
}
