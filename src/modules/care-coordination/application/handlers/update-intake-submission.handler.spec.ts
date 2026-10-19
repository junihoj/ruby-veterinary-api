import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IntakeSubmissionRepository } from '../../infrastructure/repositories/intake-submission.repository';
import { UpdateIntakeSubmissionHandler } from './update-intake-submission.handler';
import { UpdateIntakeSubmissionCommand } from '../commands/update-intake-submission.command';
import type { UpdateIntakeSubmissionDto } from '../dto/care.requests.dto';

function submissionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '0b1f4a2e-9c3d-4f5a-8b7e-1d2c3f4a5b6c',
    userId: '2f6f5f9a-1111-4222-8333-444455556666',
    contactName: 'Mabel Whitcombe',
    contactPhone: '+442079991234',
    contactEmail: 'mabel@example.com',
    addressLine1: null,
    addressLine2: null,
    city: null,
    postalCode: null,
    country: null,
    existingClient: false,
    preferredVetUserId: null,
    notes: null,
    status: 'received',
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    uploads: [],
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

describe('UpdateIntakeSubmissionHandler', () => {
  const findById = jest.fn() as jest.MockedFunction<
    IntakeSubmissionRepository['findById']
  >;
  const updateStatus = jest.fn() as jest.MockedFunction<
    IntakeSubmissionRepository['updateStatus']
  >;
  let handler: UpdateIntakeSubmissionHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    const repository = {
      findById,
      updateStatus,
    } as unknown as IntakeSubmissionRepository;
    handler = new UpdateIntakeSubmissionHandler(repository);
  });

  it('moves a received submission into review', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('intakeSubmission', uuid);
    findById.mockResolvedValue(submissionRow({ id: uuid, status: 'received' }));
    updateStatus.mockResolvedValue(
      submissionRow({ id: uuid, status: 'in_review' }),
    );

    const result = await handler.execute(
      new UpdateIntakeSubmissionCommand(id, { status: 'in_review' }),
    );

    expect(result.status).toBe('in_review');
    expect(updateStatus).toHaveBeenCalledWith(uuid, 'in_review');
  });

  it('rejects a received submission outright', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('intakeSubmission', uuid);
    findById.mockResolvedValue(submissionRow({ id: uuid, status: 'received' }));
    updateStatus.mockResolvedValue(
      submissionRow({ id: uuid, status: 'rejected' }),
    );

    const result = await handler.execute(
      new UpdateIntakeSubmissionCommand(id, { status: 'rejected' }),
    );

    expect(result.status).toBe('rejected');
  });

  it('refuses to set accepted via the review PATCH with 409', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('intakeSubmission', uuid);
    findById.mockResolvedValue(
      submissionRow({ id: uuid, status: 'in_review' }),
    );

    await expectHttpException(
      handler.execute(
        new UpdateIntakeSubmissionCommand(id, {
          status: 'accepted',
        } as unknown as UpdateIntakeSubmissionDto),
      ),
      409,
      'STATE_CONFLICT',
    );
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown submission', async () => {
    await expectHttpException(
      handler.execute(
        new UpdateIntakeSubmissionCommand('int_unknown', {
          status: 'in_review',
        }),
      ),
      404,
      'RESOURCE_NOT_FOUND',
    );
  });
});
