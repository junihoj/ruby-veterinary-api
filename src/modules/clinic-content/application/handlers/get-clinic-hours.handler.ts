import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { HttpException, HttpStatus } from '@nestjs/common';
import { GetClinicHoursQuery } from '../queries/get-clinic-hours.query';
import { HoursRepository } from '../../infrastructure/repositories/hours.repository';
import { ClinicRepository } from '../../infrastructure/repositories/clinic.repository';
import { ClinicHoursDto } from '../dto/clinic-content.dto';

@QueryHandler(GetClinicHoursQuery)
export class GetClinicHoursHandler implements IQueryHandler<GetClinicHoursQuery> {
  constructor(
    private readonly hours: HoursRepository,
    private readonly clinics: ClinicRepository,
  ) {}

  async execute(query: GetClinicHoursQuery): Promise<ClinicHoursDto> {
    void query;
    const clinic = await this.clinics.findClinic();
    if (!clinic) {
      throw new HttpException(
        { code: 'RESOURCE_NOT_FOUND', message: 'Clinic not found.' },
        HttpStatus.NOT_FOUND,
      );
    }

    const [standard, holidays] = await Promise.all([
      this.hours.findStandardHours(),
      this.hours.findHolidayHours(),
    ]);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const holiday = holidays.find(
      (h) => h.holidayDate.toISOString().slice(0, 10) === todayStr,
    );

    const weekday = now.getDay();
    const standardToday = standard.find((h) => h.weekday === weekday);

    const openNow = this.computeOpenNow(now, standardToday, holiday);

    return {
      timezone: clinic.timezone,
      openNow,
      standard: standard.map((h) => ({
        weekday: h.weekday,
        opensAt: h.closed ? null : h.opensAt.toISOString().slice(11, 19),
        closesAt: h.closed ? null : h.closesAt.toISOString().slice(11, 19),
        closed: h.closed,
      })),
      holidays: holidays.map((h) => ({
        date: h.holidayDate.toISOString().slice(0, 10),
        opensAt: h.closed
          ? null
          : h.opensAt
            ? h.opensAt.toISOString().slice(11, 19)
            : null,
        closesAt: h.closed
          ? null
          : h.closesAt
            ? h.closesAt.toISOString().slice(11, 19)
            : null,
        closed: h.closed,
      })),
    };
  }

  private computeOpenNow(
    now: Date,
    standardToday:
      { opensAt: Date; closesAt: Date; closed: boolean } | undefined,
    holiday:
      | { opensAt: Date | null; closesAt: Date | null; closed: boolean }
      | undefined,
  ): boolean {
    if (holiday) {
      if (holiday.closed || !holiday.opensAt || !holiday.closesAt) return false;
      return now >= holiday.opensAt && now <= holiday.closesAt;
    }
    if (!standardToday || standardToday.closed) return false;
    return now >= standardToday.opensAt && now <= standardToday.closesAt;
  }
}
