import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { AppointmentRequestRepository } from '../../infrastructure/repositories/appointment-request.repository';
import { TriageAppointmentRequestHandler } from './triage-appointment-request.handler';
import { TriageAppointmentRequestCommand } from '../commands/triage-appointment-request.command';

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '0b1f4a2e-9c3d-4f5a-8b7e-1d2c3f4a5b6c',
    userId: null,
    contactName: 'Mabel Whitcombe',
    contactPhone: '+442079991234',
    contactEmail: 'mabel@example.com',
    petName: 'Biscuit',
    petSpecies: 'dog',
    reason: 'Annual vaccination',
    preferredWindowStart: null,
    preferredWindowEnd: null,
    urgency: 'routine',
    status: 'received',
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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

describe('TriageAppointmentRequestHandler', () => {
  const findById = jest.fn() as jest.MockedFunction<
    AppointmentRequestRepository['findById']
  >;
  const updateStatus = jest.fn() as jest.MockedFunction<
    AppointmentRequestRepository['updateStatus']
  >;
  let handler: TriageAppointmentRequestHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    const repository = {
      findById,
      updateStatus,
    } as unknown as AppointmentRequestRepository;
    handler = new TriageAppointmentRequestHandler(repository);
  });

  it('triages a received request to scheduled', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('appointmentRequest', uuid);
    findById.mockResolvedValue(requestRow({ id: uuid, status: 'received' }));
    updateStatus.mockResolvedValue(
      requestRow({ id: uuid, status: 'scheduled' }),
    );

    const result = await handler.execute(
      new TriageAppointmentRequestCommand(id, { status: 'scheduled' }),
    );

    expect(result.status).toBe('scheduled');
    expect(updateStatus).toHaveBeenCalledWith(uuid, 'scheduled');
  });

  it('rejects an invalid transition with 409 STATE_CONFLICT', async () => {
    const uuid = randomUUID();
    const id = PrefixedId.format('appointmentRequest', uuid);
    findById.mockResolvedValue(requestRow({ id: uuid, status: 'scheduled' }));

    await expectHttpException(
      handler.execute(
        new TriageAppointmentRequestCommand(id, { status: 'triaged' }),
      ),
      409,
      'STATE_CONFLICT',
    );
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown request', async () => {
    await expectHttpException(
      handler.execute(
        new TriageAppointmentRequestCommand('apt_unknown', {
          status: 'triaged',
        }),
      ),
      404,
      'RESOURCE_NOT_FOUND',
    );
  });
});
