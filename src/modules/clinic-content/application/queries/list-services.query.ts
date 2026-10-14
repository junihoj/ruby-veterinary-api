export class ListServicesQuery {
  constructor(
    public readonly limit = 20,
    public readonly cursor?: string,
  ) {}
}
