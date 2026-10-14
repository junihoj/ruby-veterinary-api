import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface BusinessHourRow {
  weekday: number;
  opensAt: Date;
  closesAt: Date;
  closed: boolean;
}

export interface HolidayHourRow {
  holidayDate: Date;
  opensAt: Date | null;
  closesAt: Date | null;
  closed: boolean;
}

/**
 * Hours repository (content) â€” standard weekly hours + holiday overrides.
 */
@Injectable()
export class HoursRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findStandardHours(): Promise<BusinessHourRow[]> {
    return this.prisma.businessHour.findMany({
      orderBy: { weekday: 'asc' },
    });
  }

  async findHolidayHours(): Promise<HolidayHourRow[]> {
    return this.prisma.holidayHour.findMany({
      orderBy: { holidayDate: 'asc' },
    });
  }
}
