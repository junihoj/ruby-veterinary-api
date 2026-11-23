/** Internal published staff-profile lookup by identity user (M7 default author). */
export class GetStaffProfileByUserIdQuery {
  constructor(public readonly userId: string) {}
}
