import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Pharmacy decision request bodies (pharmacy.yaml). The global
 * ValidationPipe whitelists strictly: unknown fields are 400
 * VALIDATION_FAILED.
 */

/** POST /prescriptions/{id}/approve — the note is optional free text. */
export class ApprovePrescriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** POST /prescriptions/{id}/reject and /query — reason is mandatory. */
export class PrescriptionReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonCode?: string;

  @IsString()
  @MaxLength(2000)
  reasonText: string;
}
