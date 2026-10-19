import { TriageAppointmentRequestDto } from '../dto/care.requests.dto';

export class TriageAppointmentRequestCommand {
  constructor(
    readonly id: string,
    readonly input: TriageAppointmentRequestDto,
  ) {}
}
