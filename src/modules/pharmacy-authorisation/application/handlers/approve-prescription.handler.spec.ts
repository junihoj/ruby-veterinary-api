import { HttpException } from '@nestjs/common';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { ApprovePrescriptionCommand } from '../commands/approve-prescription.command';
import { PrescriptionApproved } from '../events/prescription-approved.event';
import { ApprovePrescriptionHandler } from './approve-prescription.handler';
import { PrescriptionRequestRepository } from '../../infrastructure/repositories/prescription-request.repository';

const REQUEST_UUID = 'aaaaaaaa-1111-4222-8333-444455556666';
const ORDER_UUID = 'bbbbbbbb-1111-4222-8333-444455556666';
const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VET_UUID = 'cccccccc-1111-4222-8333-444455556666';

function requestRow(status = 'pending') {
  const decided = status === 'approved' || status === 'rejected';
  return {
    id: REQUEST_UUID,
    orderId: ORDER_UUID,
    orderItemIds: ['dddddddd-1111-4222-8333-444455556666'],
    userId: USER_UUID,
    petId: 'eeeeeeee-1111-4222-8333-444455556666',
    veterinarianUserId: VET_UUID,
    status,
    ownerNote: null,
    requestedAt: new Date('2026-01-01T00:00:00Z'),
    decidedAt: decided ? new Date('2026-01-02T00:00:00Z') : null,
    decidedBy: decided ? VET_UUID : null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

const VET = { id: `usr_${VET_UUID}`, roles: ['veterinarian'] };
const MANAGER = { id: `usr_${VET_UUID}`, roles: ['practice_manager'] };

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

describe('pharmacy/ApprovePrescriptionHandler (M5)', () => {
  function build(overrides: {
    findById?: jest.MockedFunction<PrescriptionRequestRepository['findById']>;
    recordDecision?: jest.MockedFunction<
      PrescriptionRequestRepository['recordDecision']
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
        .mockResolvedValueOnce(requestRow('approved'));
    const recordDecision =
      overrides.recordDecision ??
      (
        jest.fn() as jest.MockedFunction<
          PrescriptionRequestRepository['recordDecision']
        >
      ).mockResolvedValue(true);
    const requests = {
      findById,
      recordDecision,
    } as unknown as PrescriptionRequestRepository;
    const publish =
      overrides.publish ??
      (jest.fn() as jest.MockedFunction<IntegrationEventPublisher['publish']>);
    const events = { publish } as unknown as IntegrationEventPublisher;
    return {
      handler: new ApprovePrescriptionHandler(requests, events),
      findById,
      recordDecision,
      publish,
    };
  }

  const command = (actor = VET) =>
    new ApprovePrescriptionCommand(
      `rx_${REQUEST_UUID}`,
      actor,
      'looks fine',
      null,
    );

  it('rejects a non-veterinarian with 403 PRESCRIBER_REQUIRED before touching the store', async () => {
    const { handler, findById } = build({});
    await expectHttpException(
      handler.execute(command(MANAGER)),
      403,
      'PRESCRIBER_REQUIRED',
    );
    expect(findById).not.toHaveBeenCalled();
  });

  it('answers 404 for a malformed or unknown request id', async () => {
    const { handler } = build({ findById: jest.fn().mockResolvedValue(null) });
    await expectHttpException(
      handler.execute(
        new ApprovePrescriptionCommand('rx_not-a-uuid', VET, null, null),
      ),
      404,
      'RESOURCE_NOT_FOUND',
    );
    await expectHttpException(
      handler.execute(
        new ApprovePrescriptionCommand(
          'rx_ffffffff-1111-4222-8333-444455556666',
          VET,
          null,
          null,
        ),
      ),
      404,
      'RESOURCE_NOT_FOUND',
    );
  });

  it('answers 409 STATE_CONFLICT for a terminal or concurrently decided request', async () => {
    const { handler, publish } = build({
      recordDecision: jest.fn().mockResolvedValue(false),
    });
    await expectHttpException(
      handler.execute(command()),
      409,
      'STATE_CONFLICT',
    );
    expect(publish).not.toHaveBeenCalled();
  });

  it('claims the transition and writes decision + audit in one recordDecision call', async () => {
    const { handler, recordDecision } = build({});

    const dto = await handler.execute(command());

    expect(recordDecision).toHaveBeenCalledTimes(1);
    expect(recordDecision.mock.calls[0][0]).toMatchObject({
      requestId: REQUEST_UUID,
      allowedFrom: ['pending', 'queried'],
      to: 'approved',
      decision: {
        prescriptionRequestId: REQUEST_UUID,
        decision: 'approve',
        reasonText: 'looks fine',
        decidedBy: VET_UUID,
      },
      audit: {
        prescriptionRequestId: REQUEST_UUID,
        actorUserId: VET_UUID,
        action: 'decision_recorded',
        detailJson: { decision: 'approve' },
      },
    });
    expect(dto.status).toBe('approved');
    expect(dto.decidedBy).toBe(`usr_${VET_UUID}`);
  });

  it('publishes PrescriptionApproved post-commit with prefixed ids', async () => {
    const { handler, publish } = build({
      findById: jest
        .fn()
        .mockResolvedValueOnce(requestRow())
        .mockResolvedValueOnce(requestRow('approved')),
    });

    await handler.execute(command());

    expect(publish).toHaveBeenCalledTimes(1);
    const event = publish.mock.calls[0][0] as PrescriptionApproved;
    expect(event.eventName).toBe('PrescriptionApproved');
    expect(event.payload).toMatchObject({
      prescriptionRequestId: `rx_${REQUEST_UUID}`,
      orderId: `ord_${ORDER_UUID}`,
      veterinarianUserId: `usr_${VET_UUID}`,
      note: 'looks fine',
    });
  });
});
