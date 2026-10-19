import { MedicalHistoryCreateDto } from '../dto/client-records.requests.dto';

export class CreateMedicalHistoryRecordCommand {
  constructor(
    readonly petId: string,
    readonly input: MedicalHistoryCreateDto,
    /** Staff identity filing the record (source: staff_upload). */
    readonly uploadedByUserId: string,
  ) {}
}
