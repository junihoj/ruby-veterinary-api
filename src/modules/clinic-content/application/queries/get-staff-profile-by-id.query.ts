/** Internal published staff-profile lookup by bare UUID (M7 author byline). */
export class GetStaffProfileByIdQuery {
  constructor(public readonly id: string) {}
}
