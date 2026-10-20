import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';

/**
 * pharmacy.patient_associations — pet/vet context snapshots. One association
 * snapshot per decided request; open requests snapshot on first queue view
 * (`snapshotIfNone` is insert-if-none, so repeated views never duplicate).
 */
@Injectable()
export class PatientAssociationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async snapshotIfNone(input: {
    prescriptionRequestId: string;
    petId: string;
    veterinarianUserId: string;
    clientId: string | null;
  }) {
    const existing = await this.prisma.patientAssociation.findFirst({
      where: { prescriptionRequestId: input.prescriptionRequestId },
      select: { id: true },
    });
    if (existing) return existing;
    // Callers hand over whatever form their source uses — a bare UUID off
    // the prescription row, a prefixed id from the client-records facade.
    // Every column here is a bare UUID, so all three normalise at this one
    // boundary rather than depending on the caller's shape.
    const petId = PrefixedId.tryAnyToUuid(input.petId);
    const veterinarianUserId = PrefixedId.tryAnyToUuid(
      input.veterinarianUserId,
    );
    const clientId = input.clientId
      ? PrefixedId.tryAnyToUuid(input.clientId)
      : null;
    if (!petId || !veterinarianUserId) {
      throw new Error(
        'PatientAssociationRepository.snapshotIfNone: malformed pet or veterinarian id.',
      );
    }
    return this.prisma.patientAssociation.create({
      data: {
        prescriptionRequestId: input.prescriptionRequestId,
        petId,
        veterinarianUserId,
        clientId: clientId ?? undefined,
        snapshotAt: new Date(),
      },
    });
  }

  async listByRequest(requestId: string) {
    return this.prisma.patientAssociation.findMany({
      where: { prescriptionRequestId: requestId },
      orderBy: [{ snapshotAt: 'asc' }, { id: 'asc' }],
    });
  }
}
