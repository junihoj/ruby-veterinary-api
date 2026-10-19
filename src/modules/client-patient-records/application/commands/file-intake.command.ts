import type { IntakePetInput } from '../facades/client-records-facade-port';

/**
 * Filing an accepted intake (Flow 2) — the ONLY path that creates a client
 * from intake data. Owned by this context, invoked through the facade by
 * Care Coordination; the direct cross-schema write stays forbidden.
 */
export interface FileIntakeClientSnapshot {
  displayName: string;
  email: string;
  phone: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}

export class FileIntakeCommand {
  constructor(
    /** Prefixed or bare UUID of an existing active client, else null. */
    readonly clientId: string | null,
    /** Submission owner — linked to the created client (pet claim). */
    readonly userId: string | null,
    readonly client: FileIntakeClientSnapshot,
    readonly pets: IntakePetInput[],
  ) {}
}
