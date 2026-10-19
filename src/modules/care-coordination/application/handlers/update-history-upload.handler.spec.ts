import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { ObjectStoragePort } from '../../../../shared/storage/object-storage.port';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { HistoryUploadRepository } from '../../infrastructure/repositories/history-upload.repository';
import { HistoryUploadReceived } from '../events/history-upload-received.event';
import { UpdateHistoryUploadHandler } from './update-history-upload.handler';
import { UpdateHistoryUploadCommand } from '../commands/update-history-upload.command';

function uploadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '0b1f4a2e-9c3d-4f5a-8b7e-1d2c3f4a5b6c',
    appointmentRequestId: null,
    intakeSubmissionId: '2f6f5f9a-1111-4222-8333-444455556666',
    objectKey: 'uploads/history/0b1f4a2e-9c3d-4f5a-8b7e-1d2c3f4a5b6c',
    originalFilename: 'lab-results.pdf',
    mimeType: 'application/pdf',
    byteSize: 2048,
    uploadedByUserId: '3a7a6a9b-1111-4222-8333-444455556666',
    status: 'pending',
    rejectionReason: null,
    createdAt: new Date(),
    ...overrides,
  };
}

async function expectHttpException(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  const error = await promise.then(
    () => {
      throw new Error('expected the handler to reject');
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(HttpException);
  const http = error as HttpException;
  expect(http.getStatus()).toBe(status);
  expect(http.getResponse()).toMatchObject({ code });
}

describe('UpdateHistoryUploadHandler', () => {
  const findById = jest.fn() as jest.MockedFunction<
    HistoryUploadRepository['findById']
  >;
  const update = jest.fn() as jest.MockedFunction<
    HistoryUploadRepository['update']
  >;
  const exists = jest.fn() as jest.MockedFunction<ObjectStoragePort['exists']>;
  const publish = jest.fn() as jest.MockedFunction<
    IntegrationEventPublisher['publish']
  >;
  let handler: UpdateHistoryUploadHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new UpdateHistoryUploadHandler(
      { findById, update } as unknown as HistoryUploadRepository,
      { exists } as unknown as ObjectStoragePort,
      { publish } as unknown as IntegrationEventPublisher,
    );
  });

  it('finalises after a storage hit and publishes HistoryUploadReceived', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('historyUpload', uuid);
    findById.mockResolvedValue(uploadRow({ id: uuid, status: 'pending' }));
    exists.mockResolvedValue(true);
    update.mockResolvedValue(uploadRow({ id: uuid, status: 'finalised' }));

    const result = await handler.execute(
      new UpdateHistoryUploadCommand(id, { status: 'finalised' }),
    );

    expect(result.status).toBe('finalised');
    expect(exists).toHaveBeenCalledWith(
      'uploads/history/0b1f4a2e-9c3d-4f5a-8b7e-1d2c3f4a5b6c',
    );
    expect(publish).toHaveBeenCalledTimes(1);
    const event = publish.mock.calls[0][0] as HistoryUploadReceived;
    expect(event.eventName).toBe('HistoryUploadReceived');
    expect(event.payload.historyUploadId).toBe(id);
    expect(event.payload.sourceType).toBe('intake_submission');
  });

  it('answers 422 UPLOAD_MISSING when the object is absent from storage', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('historyUpload', uuid);
    findById.mockResolvedValue(uploadRow({ id: uuid, status: 'pending' }));
    exists.mockResolvedValue(false);

    await expectHttpException(
      handler.execute(
        new UpdateHistoryUploadCommand(id, { status: 'finalised' }),
      ),
      422,
      'UPLOAD_MISSING',
    );
    expect(update).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('requires a rejection reason', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('historyUpload', uuid);
    findById.mockResolvedValue(uploadRow({ id: uuid, status: 'pending' }));

    await expectHttpException(
      handler.execute(
        new UpdateHistoryUploadCommand(id, { status: 'rejected' }),
      ),
      400,
      'VALIDATION_FAILED',
    );
  });

  it('rejects with a reason', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('historyUpload', uuid);
    findById.mockResolvedValue(uploadRow({ id: uuid, status: 'pending' }));
    update.mockResolvedValue(
      uploadRow({
        id: uuid,
        status: 'rejected',
        rejectionReason: 'Blurry scan.',
      }),
    );

    const result = await handler.execute(
      new UpdateHistoryUploadCommand(id, {
        status: 'rejected',
        rejectionReason: 'Blurry scan.',
      }),
    );

    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toBe('Blurry scan.');
    expect(exists).not.toHaveBeenCalled();
  });

  it('answers 409 when the upload is already terminal', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('historyUpload', uuid);
    findById.mockResolvedValue(uploadRow({ id: uuid, status: 'finalised' }));

    await expectHttpException(
      handler.execute(
        new UpdateHistoryUploadCommand(id, {
          status: 'rejected',
          rejectionReason: 'late',
        }),
      ),
      409,
      'STATE_CONFLICT',
    );
  });
});
