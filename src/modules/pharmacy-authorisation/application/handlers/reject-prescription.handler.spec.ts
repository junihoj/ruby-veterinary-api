import { HttpException } from '@nestjs/common';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { RejectPrescriptionCommand } from '../commands/reject-prescription.command';
import { PrescriptionRejected } from '../events/prescription-rejected.event';
import { RejectPrescriptionHandler } from './reject-prescription.handler';
import { PrescriptionRequestRepository } from '../../infrastructure/repositories/prescription-request.repository';

const REQUEST_UUID = 'aaaaaaaa-1111-4222-8333-444455556666';
const ORDER_UUID = 'bbbbbbbb-1111-4222-8333-444455556666';
const VET_UUID = 'cccccccc-1111-4222-8333-444455556666';

function requestRow(status = 'pending') {
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

describe('pharmacy/RejectPrescriptionHandler (M5)', () => {
  function build(overrides: {
    findById?: jest.MockedFunction<PrescriptionRequestRepository['findById']>;
    recordDecision?: jest.MockedFunction<
      PrescriptionRequestRepository['recordDecision']
    >;
    cancelSiblings?: jest.MockedFunction<
      PrescriptionRequestRepository['cancelSiblings']
    >;
    publish?: jest.MockedFunction<IntegrationEventPublisher['publish']>;
  }) {
    const findById =
      overrides.findById ??
      (
        jest.fn() as jest.MockedFunction<
          PrescriptionRequestRepository['findById']
        >
      )
        .mockResolvedValueOnce(requestRow())
        .mockResolvedValueOnce(requestRow('rejected'));
    const recordDecision =
      overrides.recordDecision ??
      (
        jest.fn() as jest.MockedFunction<
          PrescriptionRequestRepository['recordDecision']
        >
      ).mockResolvedValue(true);
    const cancelSiblings =
      overrides.cancelSiblings ??
      (
        jest.fn() as jest.MockedFunction<
          PrescriptionRequestRepository['cancelSiblings']
        >
      ).mockResolvedValue(1);
    const requests = {
      findById,
      recordDecision,
      cancelSiblings,
    } as unknown as PrescriptionRequestRepository;
    const publish =
      overrides.publish ??
      (jest.fn() as jest.MockedFunction<IntegrationEventPublisher['publish']>);
    const events = { publish } as unknown as IntegrationEventPublisher;
    return {
      handler: new RejectPrescriptionHandler(requests, events),
      recordDecision,
      cancelSiblings,
      publish,
    };
  }

  const command = () =>
    new RejectPrescriptionCommand(
      `rx_${REQUEST_UUID}`,
      VET,
      'wrong_dose',
      'Dose exceeds the weight band.',
      'req-123',
    );

  it('answers 409 STATE_CONFLICT when the claim loses (terminal or concurrent)', async () => {
    const { handler, cancelSiblings, publish } = build({
      recordDecision: jest.fn().mockResolvedValue(false),
    });
    await expectHttpException(
      handler.execute(command()),
      409,
      'STATE_CONFLICT',
    );
    expect(cancelSiblings).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('records the reason, cancels sibling holds, and publishes PrescriptionRejected', async () => {
    const { handler, recordDecision, cancelSiblings, publish } = build({});

    const dto = await handler.execute(command());

    expect(recordDecision.mock.calls[0][0]).toMatchObject({
      requestId: REQUEST_UUID,
      allowedFrom: ['pending', 'queried'],
      to: 'rejected',
      decision: {
        decision: 'reject',
        reasonCode: 'wrong_dose',
        reasonText: 'Dose exceeds the weight band.',
      },
      audit: {
        action: 'decision_recorded',
        detailJson: { decision: 'reject', reasonCode: 'wrong_dose' },
        requestId: 'req-123',
      },
    });
    // Sibling open requests of the same order are cancelled (no dangling hold).
    expect(cancelSiblings).toHaveBeenCalledWith(REQUEST_UUID, ORDER_UUID);
    expect(dto.status).toBe('rejected');

    expect(publish).toHaveBeenCalledTimes(1);
    const event = publish.mock.calls[0][0] as PrescriptionRejected;
    expect(event.payload).toMatchObject({
      prescriptionRequestId: `rx_${REQUEST_UUID}`,
      orderId: `ord_${ORDER_UUID}`,
      reasonCode: 'wrong_dose',
      reasonText: 'Dose exceeds the weight band.',
    });
  });

  it('rejects a practice_manager with PRESCRIBER_REQUIRED', async () => {
    const { handler } = build({});
    await expectHttpException(
      handler.execute(
        new RejectPrescriptionCommand(
          `rx_${REQUEST_UUID}`,
          { id: `usr_${VET_UUID}`, roles: ['practice_manager'] },
          null,
          'no',
          null,
        ),
      ),
      403,
      'PRESCRIBER_REQUIRED',
    );
  });
});
