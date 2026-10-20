import { HttpException } from '@nestjs/common';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { QueryPrescriptionCommand } from '../commands/query-prescription.command';
import { PrescriptionQueried } from '../events/prescription-queried.event';
import { QueryPrescriptionHandler } from './query-prescription.handler';
import { PrescriptionRequestRepository } from '../../infrastructure/repositories/prescription-request.repository';

const REQUEST_UUID = 'aaaaaaaa-1111-4222-8333-444455556666';
const ORDER_UUID = 'bbbbbbbb-1111-4222-8333-444455556666';
const VET_UUID = 'cccccccc-1111-4222-8333-444455556666';

function requestRow(status: string) {
  return {
    id: REQUEST_UUID,
    orderId: ORDER_UUID,
    orderItemIds: [],
    userId: '550e8400-e29b-41d4-a716-446655440000',
    petId: 'eeeeeeee-1111-4222-8333-444455556666',
    veterinarianUserId: VET_UUID,
    status,
    ownerNote: null,
    requestedAt: new Date('2026-01-01T00:00:00Z'),
    decidedAt: null,
    decidedBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

const VET = { id: `usr_${VET_UUID}`, roles: ['veterinarian'] };

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

describe('pharmacy/QueryPrescriptionHandler (M5)', () => {
  function build(rowStatus: string, recordDecision = true) {
    const findById = jest
      .fn()
      .mockResolvedValueOnce(requestRow(rowStatus))
      .mockResolvedValueOnce(requestRow('queried'));
    const claim = jest.fn() as jest.MockedFunction<
      PrescriptionRequestRepository['recordDecision']
    >;
    claim.mockResolvedValue(recordDecision);
    const requests = {
      findById,
      recordDecision: claim,
    } as unknown as PrescriptionRequestRepository;
    const publish = jest.fn() as jest.MockedFunction<
      IntegrationEventPublisher['publish']
    >;
    const events = { publish } as unknown as IntegrationEventPublisher;
    return {
      handler: new QueryPrescriptionHandler(requests, events),
      claim,
      publish,
    };
  }

  const command = () =>
    new QueryPrescriptionCommand(
      `rx_${REQUEST_UUID}`,
      VET,
      null,
      'Which formulation did the vet prescribe?',
      null,
    );

  it('opens the request from pending (allowedFrom pending only)', async () => {
    const { handler, claim, publish } = build('pending');

    const dto = await handler.execute(command());

    expect(claim.mock.calls[0][0]).toMatchObject({
      allowedFrom: ['pending'],
      to: 'queried',
      decision: {
        decision: 'query',
        reasonText: 'Which formulation did the vet prescribe?',
      },
    });
    expect(dto.status).toBe('queried');
    const event = publish.mock.calls[0][0];
    expect(event).toBeInstanceOf(PrescriptionQueried);
    expect(event.payload).toMatchObject({
      question: 'Which formulation did the vet prescribe?',
    });
  });

  it('answers 409 STATE_CONFLICT for an already queried or decided request', async () => {
    const { handler, publish } = build('queried', false);
    await expectHttpException(
      handler.execute(command()),
      409,
      'STATE_CONFLICT',
    );
    expect(publish).not.toHaveBeenCalled();
  });
});
