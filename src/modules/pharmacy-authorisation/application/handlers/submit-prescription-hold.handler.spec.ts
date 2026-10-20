import { HttpException } from '@nestjs/common';
import { IntegrationEventPublisher } from '../../../../shared/integration/integration-event-publisher';
import { ClientRecordsFacadePort } from '../../../client-patient-records/application/facades/client-records-facade-port';
import { SubmitPrescriptionHoldCommand } from '../commands/submit-prescription-hold.command';
import { PrescriptionRequested } from '../events/prescription-requested.event';
import { SubmitPrescriptionHoldHandler } from './submit-prescription-hold.handler';
import { PrescriptionRequestRepository } from '../../infrastructure/repositories/prescription-request.repository';

const ORDER_UUID = 'bbbbbbbb-1111-4222-8333-444455556666';
const USER_UUID = '550e8400-e29b-41d4-a716-446655440000';
const PET_UUID = 'eeeeeeee-1111-4222-8333-444455556666';
const VET_UUID = 'cccccccc-1111-4222-8333-444455556666';
const ITEM_UUID = 'dddddddd-1111-4222-8333-444455556666';

function createdRow() {
  return {
    id: 'afafafaf-1111-4222-8333-444455556666',
    orderId: ORDER_UUID,
    orderItemIds: [ITEM_UUID],
    userId: USER_UUID,
    petId: PET_UUID,
    veterinarianUserId: VET_UUID,
    status: 'pending',
    ownerNote: null,
    requestedAt: new Date('2026-01-01T00:00:00Z'),
    decidedAt: null,
    decidedBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function command() {
  return new SubmitPrescriptionHoldCommand({
    orderId: ORDER_UUID,
    userId: USER_UUID,
    ownerNote: null,
    petGroups: [{ petId: PET_UUID, orderItemIds: [ITEM_UUID] }],
  });
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

describe('pharmacy/SubmitPrescriptionHoldHandler (M5)', () => {
  function build(overrides: {
    findByOrder?: jest.MockedFunction<
      PrescriptionRequestRepository['findByOrder']
    >;
    create?: jest.MockedFunction<PrescriptionRequestRepository['create']>;
    listPrimaryVeterinarians?: jest.Mock;
    publish?: jest.MockedFunction<IntegrationEventPublisher['publish']>;
  }) {
    const findByOrder =
      overrides.findByOrder ??
      (
        jest.fn() as jest.MockedFunction<
          PrescriptionRequestRepository['findByOrder']
        >
      ).mockResolvedValue([]);
    const create =
      overrides.create ??
      (
        jest.fn() as jest.MockedFunction<
          PrescriptionRequestRepository['create']
        >
      ).mockResolvedValue(createdRow());
    const requests = {
      findByOrder,
      create,
    } as unknown as PrescriptionRequestRepository;
    const listPrimaryVeterinarians =
      overrides.listPrimaryVeterinarians ??
      jest.fn().mockResolvedValue([
        {
          veterinarianUserId: `usr_${VET_UUID}`,
          effectiveFrom: '2026-01-01T00:00:00.000Z',
          effectiveTo: null,
        },
      ]);
    const clientRecords = {
      listPrimaryVeterinarians,
    } as unknown as ClientRecordsFacadePort;
    const publish =
      overrides.publish ??
      (jest.fn() as jest.MockedFunction<IntegrationEventPublisher['publish']>);
    const events = { publish } as unknown as IntegrationEventPublisher;
    return {
      handler: new SubmitPrescriptionHoldHandler(
        requests,
        clientRecords,
        events,
      ),
      create,
      publish,
    };
  }

  it('replays an existing hold idempotently (no duplicate requests)', async () => {
    const existing = createdRow();
    const { handler, create, publish } = build({
      findByOrder: jest.fn().mockResolvedValue([existing]),
    });

    const result = await handler.execute(command());

    expect(create).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('rx_afafafaf-1111-4222-8333-444455556666');
    expect(result[0].status).toBe('pending');
  });

  it('creates one pending request per pet group and publishes PrescriptionRequested', async () => {
    const { handler, create, publish } = build({});

    const result = await handler.execute(command());

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      orderId: ORDER_UUID,
      userId: USER_UUID,
      petId: PET_UUID,
      veterinarianUserId: VET_UUID,
      orderItemIds: [ITEM_UUID],
    });
    expect(publish).toHaveBeenCalledTimes(1);
    const event = publish.mock.calls[0][0] as PrescriptionRequested;
    expect(event.payload).toMatchObject({
      orderId: `ord_${ORDER_UUID}`,
      petId: `pet_${PET_UUID}`,
      veterinarianUserId: `usr_${VET_UUID}`,
      orderItemIds: [`oit_${ITEM_UUID}`],
    });
    expect(result[0].veterinarianUserId).toBe(`usr_${VET_UUID}`);
  });

  it('answers 422 PRIMARY_VET_REQUIRED when the pet has no current link', async () => {
    const { handler, create } = build({
      // History without a current row (effectiveTo set on every link).
      listPrimaryVeterinarians: jest.fn().mockResolvedValue([
        {
          veterinarianUserId: `usr_${VET_UUID}`,
          effectiveFrom: '2025-01-01T00:00:00.000Z',
          effectiveTo: '2025-06-01T00:00:00.000Z',
        },
      ]),
    });

    await expectHttpException(
      handler.execute(command()),
      422,
      'PRIMARY_VET_REQUIRED',
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('answers 422 PRIMARY_VET_REQUIRED when the pet cannot be read at all', async () => {
    const { handler } = build({
      listPrimaryVeterinarians: jest
        .fn()
        .mockRejectedValue(new HttpException({ code: 'x' }, 404)),
    });

    await expectHttpException(
      handler.execute(command()),
      422,
      'PRIMARY_VET_REQUIRED',
    );
  });
});
