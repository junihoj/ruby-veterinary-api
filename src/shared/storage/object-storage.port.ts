/**
 * Object storage port (§6.2, ADR-0016). Outbound port for S3-compatible
 * object storage (SeaweedFS in dev). Genuinely shared — clinic documents
 * (M2), commerce downloads (M3b), intake uploads (M4) — so it lives in
 * shared/ rather than any single context.
 *
 * The port is S3-shaped: the storage implementation stays swappable without
 * code changes (the exit path ADR-0009 wanted, proven necessary by ADR-0016).
 */
export interface PresignedUploadUrl {
  url: string;
  key: string;
  expiresIn: number;
}

export interface PresignedDownloadUrl {
  url: string;
  expiresIn: number;
}

export abstract class ObjectStoragePort {
  /** Short-lived signed URL for a client to PUT an object directly. */
  abstract presignUpload(
    key: string,
    contentType: string,
  ): Promise<PresignedUploadUrl>;

  /** Short-lived signed URL for a client (or browser) to GET an object. */
  abstract presignDownload(key: string): Promise<PresignedDownloadUrl>;
}
