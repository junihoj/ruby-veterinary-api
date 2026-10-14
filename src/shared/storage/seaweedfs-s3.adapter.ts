import { Inject, Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  APP_CONFIG,
  type AppConfig,
  type S3Config,
} from '../../config/config.types';
import {
  ObjectStoragePort,
  PresignedDownloadUrl,
  PresignedUploadUrl,
} from './object-storage.port';

/**
 * SeaweedFS S3 adapter (ADR-0016). Speaks the S3 API to the configured
 * endpoint (dev compose: http://localhost:8333) with path-style addressing,
 * which SeaweedFS requires. Storage stays optional: the client is built
 * lazily on first use, and presigning fails closed with a clear error when
 * S3_* is not configured — boot never depends on it.
 */
@Injectable()
export class SeaweedFsS3Adapter implements ObjectStoragePort {
  private readonly s3?: S3Config;
  private client?: S3Client;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.s3 = config.s3;
  }

  /** Lazily constructed client; throws only when storage is used unconfigured. */
  private requireClient(): S3Client {
    if (!this.s3) {
      throw new Error(
        'Object storage is not configured: set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY.',
      );
    }
    this.client ??= new S3Client({
      endpoint: this.s3.endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: this.s3.accessKey,
        secretAccessKey: this.s3.secretKey,
      },
    });
    return this.client;
  }

  async presignUpload(
    key: string,
    contentType: string,
  ): Promise<PresignedUploadUrl> {
    const command = new PutObjectCommand({
      Bucket: 'ruby-veterinary',
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(this.requireClient(), command, {
      expiresIn: 900,
    });
    return { url, key, expiresIn: 900 };
  }

  async presignDownload(key: string): Promise<PresignedDownloadUrl> {
    const command = new GetObjectCommand({
      Bucket: 'ruby-veterinary',
      Key: key,
    });
    const url = await getSignedUrl(this.requireClient(), command, {
      expiresIn: 300,
    });
    return { url, expiresIn: 300 };
  }
}
