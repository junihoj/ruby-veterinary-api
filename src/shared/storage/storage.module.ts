import { Global, Module } from '@nestjs/common';
import { ObjectStoragePort } from './object-storage.port';
import { SeaweedFsS3Adapter } from './seaweedfs-s3.adapter';

/**
 * Shared object-storage wiring (ADR-0016). The adapter receives APP_CONFIG
 * and builds its S3 client lazily, so boot stays healthy without S3_* set;
 * contexts inject the ObjectStoragePort token.
 */
@Global()
@Module({
  providers: [
    SeaweedFsS3Adapter,
    { provide: ObjectStoragePort, useExisting: SeaweedFsS3Adapter },
  ],
  exports: [ObjectStoragePort],
})
export class StorageModule {}
