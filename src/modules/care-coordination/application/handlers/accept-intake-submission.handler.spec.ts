import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import {
  ClientRecordsFacadePort,
  type FileIntakeResult,
} from '../../../client-patient-records/application/facades/client-records-facade-port';
import { IntakeSubmissionRepository } from '../../infrastructure/repositories/intake-submission.repository';
import { IntakeComplete } from '../events/intake-complete.event';
import { AcceptIntakeSubmissionHandler } from './accept-intake-submission.handler';
import { AcceptIntakeSubmissionCommand } from '../commands/accept-intake-submission.command';
import type { PetDraftDto } from '../dto/care.requests.dto';

const PET_DRAFT: PetDraftDto = {
  name: 'Biscuit',
  species: 'dog',
  breed: 'Border Terrier',
  sex: 'male',
  neutered: true,
};

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

function filedResult(clientId: string): FileIntakeResult {
  return {
    clientId,
    pets: [
      {
        id: 'pet_9f2c4e10-aaaa-bbbb-cccc-000000000001',
        name: 'Biscuit',
        species: 'dog',
        breed: 'Border Terrier',
        status: 'active',
      },
    ],
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

describe('AcceptIntakeSubmissionHandler (Flow 2)', () => {
  const findById = jest.fn() as jest.MockedFunction<
    IntakeSubmissionRepository['findById']
  >;
  const claimAcceptance = jest.fn() as jest.MockedFunction<
    IntakeSubmissionRepository['claimAcceptance']
  >;
  const revertStatus = jest.fn() as jest.MockedFunction<
    IntakeSubmissionRepository['revertStatus']
  >;
  const fileIntake = jest.fn() as jest.MockedFunction<
    ClientRecordsFacadePort['fileIntake']
  >;
  const publish = jest.fn() as jest.MockedFunction<
    IntegrationEventPublisher['publish']
  >;
  let handler: AcceptIntakeSubmissionHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new AcceptIntakeSubmissionHandler(
      {
        findById,
        claimAcceptance,
        revertStatus,
      } as unknown as IntakeSubmissionRepository,
      { fileIntake } as unknown as ClientRecordsFacadePort,
      { publish } as unknown as IntegrationEventPublisher,
    );
  });

  it('accepts a received submission, files the client, and publishes IntakeComplete', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('intakeSubmission', uuid);
    findById.mockResolvedValue(submissionRow({ id: uuid, status: 'received' }));
    claimAcceptance.mockResolvedValue(true);
    fileIntake.mockResolvedValue(
      filedResult('cli_9f2c4e10-aaaa-bbbb-cccc-000000000001'),
    );

    const result = await handler.execute(
      new AcceptIntakeSubmissionCommand(id, { pets: [PET_DRAFT] }),
    );

    expect(result.status).toBe('accepted');
    expect(result.clientId).toBe('cli_9f2c4e10-aaaa-bbbb-cccc-000000000001');
    expect(result.pets[0].name).toBe('Biscuit');
    expect(claimAcceptance).toHaveBeenCalledWith(uuid, [
      'received',
      'in_review',
    ]);
    expect(publish).toHaveBeenCalledTimes(1);
    const event = publish.mock.calls[0][0] as IntakeComplete;
    expect(event.eventName).toBe('IntakeComplete');
    expect(event.payload.intakeSubmissionId).toBe(id);
    expect(event.payload.userId).toBe('2f6f5f9a-1111-4222-8333-444455556666');
    expect(revertStatus).not.toHaveBeenCalled();
  });

  it('answers 422 INTAKE_NOT_ACCEPTABLE when an existingClient lacks clientId', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('intakeSubmission', uuid);
    findById.mockResolvedValue(
      submissionRow({ id: uuid, status: 'received', existingClient: true }),
    );

    await expectHttpException(
      handler.execute(
        new AcceptIntakeSubmissionCommand(id, { pets: [PET_DRAFT] }),
      ),
      422,
      'INTAKE_NOT_ACCEPTABLE',
    );
    expect(claimAcceptance).not.toHaveBeenCalled();
  });

  it('answers 409 when the submission is already accepted', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('intakeSubmission', uuid);
    findById.mockResolvedValue(submissionRow({ id: uuid, status: 'accepted' }));

    await expectHttpException(
      handler.execute(
        new AcceptIntakeSubmissionCommand(id, { pets: [PET_DRAFT] }),
      ),
      409,
      'STATE_CONFLICT',
    );
  });

  it('answers 409 when the conditional claim loses a concurrent accept race', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('intakeSubmission', uuid);
    findById.mockResolvedValue(submissionRow({ id: uuid, status: 'received' }));
    claimAcceptance.mockResolvedValue(false);

    await expectHttpException(
      handler.execute(
        new AcceptIntakeSubmissionCommand(id, { pets: [PET_DRAFT] }),
      ),
      409,
      'STATE_CONFLICT',
    );
    expect(fileIntake).not.toHaveBeenCalled();
  });

  it('reverts the claim and rethrows when filing fails', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('intakeSubmission', uuid);
    findById.mockResolvedValue(
      submissionRow({ id: uuid, status: 'in_review' }),
    );
    claimAcceptance.mockResolvedValue(true);
    const filingError = new HttpException(
      { code: 'RESOURCE_NOT_FOUND', message: 'Client not found.' },
      404,
    );
    fileIntake.mockRejectedValue(filingError);

    const error = await handler
      .execute(new AcceptIntakeSubmissionCommand(id, { pets: [PET_DRAFT] }))
      .then(
        () => {
          throw new Error('expected the handler to reject');
        },
        (reason: unknown) => reason,
      );

    expect(error).toBe(filingError);
    expect(revertStatus).toHaveBeenCalledWith(uuid, 'in_review');
    expect(publish).not.toHaveBeenCalled();
  });

  it('routes filing through the clients facade with the submission snapshot', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('intakeSubmission', uuid);
    const ownerUuid = randomUUID();
    findById.mockResolvedValue(
      submissionRow({
        id: uuid,
        status: 'received',
        userId: ownerUuid,
        contactEmail: 'new@example.com',
      }),
    );
    claimAcceptance.mockResolvedValue(true);
    fileIntake.mockResolvedValue(filedResult('cli_2'));

    await handler.execute(
      new AcceptIntakeSubmissionCommand(id, { pets: [PET_DRAFT] }),
    );

    const command = fileIntake.mock.calls[0][0];
    expect(command.userId).toBe(ownerUuid);
    expect(command.client).toMatchObject({
      displayName: 'Mabel Whitcombe',
      email: 'new@example.com',
      phone: '+442079991234',
    });
    expect(command.pets).toEqual([PET_DRAFT]);
  });
});
