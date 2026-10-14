import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface ClinicRow {
  id: string;
  name: string;
  slug: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  country: string;
  mainPhone: string;
  emergencyPhone: string;
  whatsappDisplay: string | null;
  timezone: string;
}

/**
 * Clinic repository (content). Single-clinic profile â€” every query reads
 * the one seeded row.
 */
@Injectable()
export class ClinicRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findClinic(): Promise<ClinicRow | null> {
    return this.prisma.clinic.findFirst();
  }
}
