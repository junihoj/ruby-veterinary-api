import { HttpException } from '@nestjs/common';
import { ClinicContentFacadePort } from '../../../clinic-content/application/facades/clinic-content-facade-port';
import { PharmacyFacadePort } from '../../../pharmacy-authorisation/application/facades/pharmacy-facade-port';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import { OrderRepository } from '../../infrastructure/repositories/order.repository';
import { PaymentRepository } from '../../infrastructure/repositories/payment.repository';
import { StockConflictError } from '../../infrastructure/errors';
import {
  PaymentGatewayPort,
  PaymentGatewayUnavailableError,
} from '../../infrastructure/payment/payment-gateway.port';
import { CheckoutCommand } from '../commands/checkout.command';
import { CheckoutHandler } from './checkout.handler';

const CLINIC_PHONE = '+442071234567';
const PET_ID = '9c1e2d3a-1111-4222-8333-444455556666';
const ORDER_ID = '11111111-2222-4333-8444-555555555555';

/** Minimal order row toOrderDto can serialise (success-path fixture). */
function orderRowFixture(orderId: string, status: string) {
  return {
    id: orderId,
    status,
    currency: 'GBP',
    subtotal: { toString: () => '25.00' },
    taxTotal: { toString: () => '0.00' },
    shippingTotal: { toString: () => '4.99' },
    grandTotal: { toString: () => '29.99' },
    fulfilmentMethod: 'ship',
    shippingAddressJson: null,
    placedAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    items: [],
    fulfilments: [],
    payments: [],
  };
}

function cartRow(overrides?: {
  requiresPrescription?: boolean;
  petId?: string | null;
}) {
  return {
    id: '0b1f4a2e-9c3d-4f5a-8b7e-1d2c3f4a5b6c',
    status: 'open',
    items: [
      {
        id: '2f6f5f9a-1111-4222-8333-444455556666',
        productId: '3a7a6a9b-1111-4222-8333-444455556666',
        variantId: '4b8b7b9c-1111-4222-8333-444455556666',
        quantity: 2,
        petId: overrides?.petId ?? null,
        addedAt: new Date('2026-01-01T00:00:00Z'),
        variant: {
          name: 'Single pipette',
          price: { toString: () => '12.50' },
          currency: 'GBP',
        },
        product: {
          name: overrides?.requiresPrescription
            ? 'Amoxicillin 100mg'
            : 'Flea & Tick Spot-On',
          slug: overrides?.requiresPrescription
            ? 'amoxicillin-100mg'
            : 'flea-tick-spot-on',
          productType: 'simple',
          pricingMode: null,
          requiresPrescription: overrides?.requiresPrescription ?? false,
          isVirtual: false,
          isDownloadable: false,
        },
        components: [],
      },
    ],
  };
}

async function expectHttpException(
  promise: Promise<unknown>,
  status: number,
  code: string,
  messageContains?: string,
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
  if (messageContains) {
    const response = http.getResponse() as { message?: unknown };
    expect(String(response.message)).toContain(messageContains);
  }
}

describe('commerce/CheckoutHandler', () => {
  const command = new CheckoutCommand('550e8400-e29b-41d4-a716-446655440000', {
    fulfilmentMethod: 'pickup',
  });

  function buildHandler(overrides: {
    cart?: unknown;
    placeOrder?: jest.Mock;
    createIntent?: jest.Mock;
    getClinicContact?: jest.Mock;
    cancelHeldOrder?: jest.MockedFunction<PaymentRepository['cancelHeldOrder']>;
    submitHold?: jest.MockedFunction<PharmacyFacadePort['submitHold']>;
    getOrderStatus?: jest.Mock;
  }): {
    handler: CheckoutHandler;
    mocks: {
      submitHold: jest.MockedFunction<PharmacyFacadePort['submitHold']>;
      cancelHeldOrder: jest.MockedFunction<
        PaymentRepository['cancelHeldOrder']
      >;
      getOrderStatus: jest.Mock;
    };
  } {
    const carts = {
      findOpenByUserId: jest.fn().mockResolvedValue(overrides.cart ?? null),
    } as unknown as CartRepository;
    const orders = {
      placeOrder:
        overrides.placeOrder ??
        jest.fn().mockResolvedValue({
          orderId: ORDER_ID,
          items: [],
        }),
      findByIdempotencyKey: jest.fn(),
      findOwn: jest
        .fn()
        .mockResolvedValue(orderRowFixture(ORDER_ID, 'pending_payment')),
    } as unknown as OrderRepository;
    const cancelHeldOrder =
      overrides.cancelHeldOrder ??
      (
        jest.fn() as jest.MockedFunction<PaymentRepository['cancelHeldOrder']>
      ).mockResolvedValue(true);
    const payments = {
      cancelHeldOrder,
    } as unknown as PaymentRepository;
    const gateway = {
      createIntent:
        overrides.createIntent ??
        jest
          .fn()
          .mockResolvedValue({ gateway: 'mock', gatewayPaymentRef: 'x' }),
    } as unknown as PaymentGatewayPort;
    const clinic = {
      getClinicContact:
        overrides.getClinicContact ??
        jest.fn().mockResolvedValue({ mainPhone: CLINIC_PHONE }),
    } as unknown as ClinicContentFacadePort;
    const submitHold =
      overrides.submitHold ??
      (
        jest.fn() as jest.MockedFunction<PharmacyFacadePort['submitHold']>
      ).mockResolvedValue([]);
    const getOrderStatus =
      overrides.getOrderStatus ?? jest.fn().mockResolvedValue(null);
    const pharmacy = {
      submitHold,
      getOrderStatus,
    } as unknown as PharmacyFacadePort;
    return {
      handler: new CheckoutHandler(
        carts,
        orders,
        payments,
        gateway,
        clinic,
        pharmacy,
      ),
      mocks: {
        submitHold,
        cancelHeldOrder,
        getOrderStatus,
      },
    };
  }

  it('maps a gateway outage to 503 DEPENDENCY_UNAVAILABLE with the clinic phone', async () => {
    const { handler } = buildHandler({
      cart: cartRow(),
      createIntent: jest
        .fn()
        .mockRejectedValue(new PaymentGatewayUnavailableError()),
    });

    await expectHttpException(
      handler.execute(command),
      503,
      'DEPENDENCY_UNAVAILABLE',
      CLINIC_PHONE,
    );
  });

  it('still answers 503 when the clinic contact fallback itself fails', async () => {
    const { handler } = buildHandler({
      cart: cartRow(),
      createIntent: jest
        .fn()
        .mockRejectedValue(new PaymentGatewayUnavailableError()),
      getClinicContact: jest.fn().mockRejectedValue(new Error('content down')),
    });

    await expectHttpException(
      handler.execute(command),
      503,
      'DEPENDENCY_UNAVAILABLE',
      'temporarily unavailable',
    );
  });

  it('answers 400 VALIDATION_FAILED for an empty or missing cart', async () => {
    const { handler } = buildHandler({ cart: null });
    await expectHttpException(
      handler.execute(command),
      400,
      'VALIDATION_FAILED',
      'cart is empty',
    );
  });

  it('maps a lost stock race to 409 STOCK_CHANGED', async () => {
    const { handler } = buildHandler({
      cart: cartRow(),
      placeOrder: jest.fn().mockRejectedValue(new StockConflictError()),
    });

    await expectHttpException(
      handler.execute(command),
      409,
      'STOCK_CHANGED',
      'Stock changed',
    );
  });

  describe('M5 pharmacy hold (Flow 4)', () => {
    const rxCommand = new CheckoutCommand(
      '550e8400-e29b-41d4-a716-446655440000',
      { fulfilmentMethod: 'ship' },
    );

    it('never touches the pharmacy for a non-Rx cart', async () => {
      const { handler, mocks } = buildHandler({ cart: cartRow() });
      await handler.execute(command);
      expect(mocks.submitHold).not.toHaveBeenCalled();
    });

    it('places the hold per pet group and fills prescriptionStatus', async () => {
      const placed = {
        orderId: 'c0ffee00-1111-4222-8333-444455556666',
        items: [
          {
            id: '17e57ed0-1111-4222-8333-444455556666',
            productId: '3a7a6a9b-1111-4222-8333-444455556666',
            petId: PET_ID,
            requiresPrescription: true,
          },
        ],
      };
      const orders = {
        placeOrder: jest.fn().mockResolvedValue(placed),
        findByIdempotencyKey: jest.fn(),
        findOwn: jest
          .fn()
          .mockResolvedValue(
            orderRowFixture(placed.orderId, 'awaiting_prescription'),
          ),
      } as unknown as OrderRepository;
      const carts = {
        findOpenByUserId: jest
          .fn()
          .mockResolvedValue(
            cartRow({ requiresPrescription: true, petId: PET_ID }),
          ),
      } as unknown as CartRepository;
      const submitHold = (
        jest.fn() as jest.MockedFunction<PharmacyFacadePort['submitHold']>
      ).mockResolvedValue([]);
      const getOrderStatus = jest.fn().mockResolvedValue('pending');
      const handler = new CheckoutHandler(
        carts,
        orders,
        { cancelHeldOrder: jest.fn() } as unknown as PaymentRepository,
        {
          createIntent: jest
            .fn()
            .mockResolvedValue({ gateway: 'mock', gatewayPaymentRef: 'x' }),
        },
        {
          getClinicContact: jest
            .fn()
            .mockResolvedValue({ mainPhone: CLINIC_PHONE }),
        } as unknown as ClinicContentFacadePort,
        { submitHold, getOrderStatus } as unknown as PharmacyFacadePort,
      );

      const dto = await handler.execute(rxCommand);

      expect(submitHold).toHaveBeenCalledTimes(1);
      expect(submitHold.mock.calls[0][0].input).toMatchObject({
        orderId: placed.orderId,
        userId: '550e8400-e29b-41d4-a716-446655440000',
        ownerNote: null,
        petGroups: [
          {
            petId: PET_ID,
            orderItemIds: ['17e57ed0-1111-4222-8333-444455556666'],
          },
        ],
      });
      expect(getOrderStatus).toHaveBeenCalledWith(placed.orderId);
      expect(dto.prescriptionStatus).toBe('pending');
    });

    it('compensates the order away and surfaces the hold error (e.g. PRIMARY_VET_REQUIRED)', async () => {
      const placed = {
        orderId: 'c0ffee00-1111-4222-8333-444455556666',
        items: [
          {
            id: '17e57ed0-1111-4222-8333-444455556666',
            productId: '3a7a6a9b-1111-4222-8333-444455556666',
            petId: PET_ID,
            requiresPrescription: true,
          },
        ],
      };
      const { handler, mocks } = buildHandler({
        cart: cartRow({ requiresPrescription: true, petId: PET_ID }),
        placeOrder: jest.fn().mockResolvedValue(placed),
        submitHold: jest
          .fn()
          .mockRejectedValue(
            new HttpException(
              { code: 'PRIMARY_VET_REQUIRED', message: 'no vet' },
              422,
            ),
          ),
      });

      await expectHttpException(
        handler.execute(rxCommand),
        422,
        'PRIMARY_VET_REQUIRED',
      );
      expect(mocks.cancelHeldOrder).toHaveBeenCalledWith(
        placed.orderId,
        'rx_hold_failed',
      );
    });
  });
});
