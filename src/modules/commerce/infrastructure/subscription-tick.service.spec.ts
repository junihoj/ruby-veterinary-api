import { SubscriptionTickService } from './subscription-tick.service';
import { StockConflictError } from './errors';
import type { AppConfig } from '../../../config/config.types';
import type {
  OrderRepository,
  PlaceOrderInput,
} from './repositories/order.repository';
import type { PaymentRepository } from './repositories/payment.repository';
import type { SubscriptionRepository } from './repositories/subscription.repository';

/**
 * Subscription timer behaviour (commerce.md subscriptions, M3b): a due row
 * is claimed (conditional `next_order_at` advance), placed as a system
 * order with the deterministic idempotency key, and auto-captured; a stock
 * conflict pauses instead of ordering. Fake timers verify the interval
 * wiring and the disabled (0) configuration.
 */

const DUE_AT = new Date('2026-01-01T00:00:00.000Z');

function dueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_00000000-0000-4000-8000-000000000001',
    userId: 'usr_00000000-0000-4000-8000-000000000001',
    productId: 'prd_00000000-0000-4000-8000-000000000001',
    petId: null,
    frequency: 'monthly',
    nextOrderAt: DUE_AT,
    product: { requiresPrescription: false },
    variant: {
      id: 'var_00000000-0000-4000-8000-000000000001',
      name: 'Single pack',
      price: { toString: () => '12.50' },
      active: true,
    },
    ...overrides,
  };
}

interface Mocks {
  listDue: jest.Mock;
  claimDue: jest.Mock;
  pause: jest.Mock;
  reclaim: jest.Mock;
  placeOrder: jest.Mock;
  findPendingByOrder: jest.Mock;
  confirmCapture: jest.Mock;
  createIntent: jest.Mock;
}

function buildService(options: {
  tickMs?: number;
  rows?: ReturnType<typeof dueRow>[];
  claimResult?: boolean;
  placeOrderImpl?: () => Promise<string>;
}): { service: SubscriptionTickService; mocks: Mocks } {
  const rows = options.rows ?? [dueRow()];
  const mocks: Mocks = {
    listDue: jest.fn().mockResolvedValue(rows),
    claimDue: jest.fn().mockResolvedValue(options.claimResult ?? true),
    pause: jest.fn().mockResolvedValue(undefined),
    reclaim: jest.fn().mockResolvedValue(undefined),
    placeOrder:
      options.placeOrderImpl !== undefined
        ? jest.fn().mockImplementation(options.placeOrderImpl)
        : jest
            .fn()
            .mockResolvedValue('ord_00000000-0000-4000-8000-000000000001'),
    findPendingByOrder: jest
      .fn()
      .mockResolvedValue({ id: 'pay_00000000-0000-4000-8000-000000000001' }),
    confirmCapture: jest.fn().mockResolvedValue(true),
    createIntent: jest
      .fn()
      .mockResolvedValue({ gateway: 'mock', gatewayPaymentRef: 'pi_sub_1' }),
  };
  const config = {
    subscriptionsTickMs: options.tickMs ?? 0,
  } as AppConfig;
  const service = new SubscriptionTickService(
    config,
    mocks as unknown as SubscriptionRepository,
    mocks as unknown as OrderRepository,
    mocks as unknown as PaymentRepository,
    mocks,
  );
  return { service, mocks };
}

describe('commerce/SubscriptionTickService (M3b auto-refill)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never starts an interval when the tick is disabled', () => {
    const { service } = buildService({ tickMs: 0 });
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    service.onModuleInit();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
  });

  it('starts an interval at the configured cadence', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const { service } = buildService({ tickMs: 60_000 });
    service.onModuleInit();
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    service.onModuleDestroy();
    setIntervalSpy.mockRestore();
  });

  it('orders and auto-captures a due row with the deterministic key', async () => {
    const { service, mocks } = buildService({});
    await service.tickOnce();

    expect(mocks.claimDue).toHaveBeenCalledWith(
      'sub_00000000-0000-4000-8000-000000000001',
      DUE_AT,
      expect.any(Date),
    );
    expect(mocks.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr_00000000-0000-4000-8000-000000000001',
        cartId: null,
        method: 'ship',
        idempotencyKey: `sub:sub_00000000-0000-4000-8000-000000000001:${DUE_AT.toISOString()}`,
      }),
    );
    // Ship totals: 12.50 + 20% VAT + 4.99 flat = 19.99
    const placed = (
      mocks.placeOrder.mock.calls as unknown as [PlaceOrderInput][]
    )[0][0];
    expect(placed.totals.grandTotal).toBe('19.99');
    expect(mocks.confirmCapture).toHaveBeenCalledWith(
      'pay_00000000-0000-4000-8000-000000000001',
      'ord_00000000-0000-4000-8000-000000000001',
    );
  });

  it('does nothing when the claim is lost (raced tick or user update)', async () => {
    const { service, mocks } = buildService({ claimResult: false });
    await service.tickOnce();

    expect(mocks.placeOrder).not.toHaveBeenCalled();
    expect(mocks.confirmCapture).not.toHaveBeenCalled();
  });

  it('pauses instead of ordering when stock cannot be reserved', async () => {
    const { service, mocks } = buildService({
      placeOrderImpl: () => Promise.reject(new StockConflictError()),
    });
    await service.tickOnce();

    expect(mocks.pause).toHaveBeenCalledWith(
      'sub_00000000-0000-4000-8000-000000000001',
    );
    expect(mocks.confirmCapture).not.toHaveBeenCalled();
  });

  it('re-opens the due window when the gateway is down', async () => {
    const { service, mocks } = buildService({});
    mocks.createIntent.mockRejectedValue(new Error('gateway down'));
    await service.tickOnce();

    expect(mocks.reclaim).toHaveBeenCalledTimes(1);
    expect(mocks.placeOrder).not.toHaveBeenCalled();
    // No pause: the row stays active for the next tick.
    expect(mocks.pause).not.toHaveBeenCalled();
  });

  it('pauses prescription rows until Pharmacy (M5) can approve them', async () => {
    const { service, mocks } = buildService({
      rows: [dueRow({ product: { requiresPrescription: true } })],
    });
    await service.tickOnce();

    expect(mocks.pause).toHaveBeenCalledWith(
      'sub_00000000-0000-4000-8000-000000000001',
    );
    expect(mocks.claimDue).not.toHaveBeenCalled();
  });

  it('keeps processing other rows when one row throws', async () => {
    const failing = dueRow({ id: 'sub_00000000-0000-4000-8000-000000000bad' });
    const healthy = dueRow({ id: 'sub_00000000-0000-4000-8000-000000000002' });
    const { service, mocks } = buildService({
      rows: [failing, healthy],
      placeOrderImpl: jest
        .fn()
        .mockRejectedValueOnce(new Error('unexpected'))
        .mockResolvedValueOnce('ord_00000000-0000-4000-8000-000000000002'),
    });

    await service.tickOnce();

    expect(mocks.confirmCapture).toHaveBeenCalledTimes(1);
    expect(mocks.placeOrder).toHaveBeenCalledTimes(2);
  });
});
