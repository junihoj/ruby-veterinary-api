import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import type { PrescriptionRequest } from '../../../../generated/prisma/client';
import type {
  PrescriptionDecisionDto,
  PrescriptionRequestDto,
  PrescriptionStatus,
} from './pharmacy.responses.dto';

/** Prisma rows arrive with bare UUIDs; DTOs serialise prefixed ids. */

const STATUSES: readonly PrescriptionStatus[] = [
  'pending',
  'approved',
  'rejected',
  'queried',
];

function toStatus(status: string): PrescriptionStatus {
  return (STATUSES as readonly string[]).includes(status)
    ? (status as PrescriptionStatus)
    : 'pending';
}

export function toPrescriptionRequestDto(
  row: PrescriptionRequest,
): PrescriptionRequestDto {
  return {
    id: PrefixedId.format('prescriptionRequest', row.id),
    orderId: PrefixedId.format('order', row.orderId),
    orderItemIds: row.orderItemIds.map((id) =>
      PrefixedId.format('orderItem', id),
    ),
    userId: PrefixedId.format('user', row.userId),
    petId: PrefixedId.format('pet', row.petId),
    veterinarianUserId: PrefixedId.format('user', row.veterinarianUserId),
    status: toStatus(row.status),
    ownerNote: row.ownerNote,
    requestedAt: row.requestedAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    decidedBy: row.decidedBy ? PrefixedId.format('user', row.decidedBy) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPrescriptionDecisionDto(row: {
  id: string;
  prescriptionRequestId: string;
  decision: string;
  reasonCode: string | null;
  reasonText: string | null;
  decidedBy: string;
  decidedAt: Date;
}): PrescriptionDecisionDto {
  return {
    id: PrefixedId.format('prescriptionDecision', row.id),
    prescriptionRequestId: PrefixedId.format(
      'prescriptionRequest',
      row.prescriptionRequestId,
    ),
    decision: row.decision as PrescriptionDecisionDto['decision'],
    reasonCode: row.reasonCode,
    reasonText: row.reasonText,
    decidedBy: PrefixedId.format('user', row.decidedBy),
    decidedAt: row.decidedAt.toISOString(),
  };
}
