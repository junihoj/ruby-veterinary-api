/** POST /downloads/{grantId}/url — short-lived signed URL for one file (M3b). */
export class IssueDownloadUrlCommand {
  constructor(
    public readonly userId: string,
    public readonly grantId: string,
  ) {}
}
