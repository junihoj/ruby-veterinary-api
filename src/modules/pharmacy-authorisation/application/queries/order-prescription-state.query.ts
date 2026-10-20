/**
 * Commerce reads (via the facade port, never the pharmacy schema):
 * `getOrderPrescriptionStatus` fills `OrderDto.prescriptionStatus`;
 * `isOrderApproved` gates the capture release to `paid`.
 */
export class GetOrderPrescriptionStatusQuery {
  constructor(readonly orderId: string) {}
}

export class IsOrderApprovedQuery {
  constructor(readonly orderId: string) {}
}
