import { AppointmentRequestCreateDto } from '../dto/care.requests.dto';

export class CreateAppointmentRequestCommand {
  constructor(
    readonly input: AppointmentRequestCreateDto,
    /** Verified identity when the owner submitted signed-in (optional auth). */
    readonly userId: string | null,
  ) {}
}
