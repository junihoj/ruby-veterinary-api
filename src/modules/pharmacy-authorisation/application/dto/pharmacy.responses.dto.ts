/**
 * Pharmacy Authorisation response bodies (pharmacy.yaml). Nullable-vs-optional
 * follows the contract: `nullable: true` properties serialise explicit nulls.
 * All dates are ISO strings; ids are prefixed (`rx_`, `rxd_`).
 */

/** `pending | approved | rejected | queried` (terminal states never reopen). */
export type PrescriptionStatus =
  'pending' | 'approved' | 'rejected' | 'queried';

export interface PrescriptionDecisionDto {
  id: string;
  prescriptionRequestId: string;
  decision: 'approve' | 'reject' | 'query';
  reasonCode: string | null;
  reasonText: string | null;
  decidedBy: string;
  decidedAt: string;
}

export interface PrescriptionRequestDto {
  id: string;
  orderId: string;
  orderItemIds: string[];
  userId: string;
  petId: string;
  veterinarianUserId: string;
  status: PrescriptionStatus;
  ownerNote: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  createdAt: string;
}

export interface PrescriptionQueueItemDto extends PrescriptionRequestDto {
  petName?: string;
  clientName?: string;
}

export interface PrescriptionRequestDetailDto extends PrescriptionRequestDto {
  pet: { id: string; name: string };
  client?: { id: string; displayName: string };
  decisions: PrescriptionDecisionDto[];
}

/** Shared page shape (commerce/care PagedResult twin). */
export interface PagedResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** One Rx line-group of an order, ready for the pharmacy hold. */
export interface SubmitHoldPetGroup {
  /** Bare UUID (callers parse prefixed ids before crossing the port). */
  petId: string;
  /** Bare UUIDs of the order items this group covers. */
  orderItemIds: string[];
}

export interface SubmitHoldInput {
  orderId: string;
  userId: string;
  ownerNote: string | null;
  petGroups: SubmitHoldPetGroup[];
}
