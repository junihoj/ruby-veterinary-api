import type { SubmitHoldInput } from '../dto/pharmacy.responses.dto';

/**
 * Commerce places the pharmacy hold synchronously at checkout (bounded
 * context: "Commerce -> Pharmacy Authorisation to place a hold"). Input
 * carries bare UUIDs; the pharmacy resolves each pet's current primary vet
 * itself (denormalised at request time, data-model pharmacy-authorisation).
 */
export class SubmitPrescriptionHoldCommand {
  constructor(readonly input: SubmitHoldInput) {}
}
