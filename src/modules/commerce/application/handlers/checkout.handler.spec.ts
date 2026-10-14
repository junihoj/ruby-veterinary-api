import { HttpException } from '@nestjs/common';
import { ClinicContentFacadePort } from '../../../clinic-content/application/facades/clinic-content-facade-port';
import { CartRepository } from '../../infrastructure/repositories/cart.repository';
import { OrderRepository } from '../../infrastructure/repositories/order.repository';
import { StockConflictError } from '../../infrastructure/errors';
import {
  PaymentGatewayPort,
  PaymentGatewayUnavailableError,
} from '../../infrastructure/payment/payment-gateway.port';
import { CheckoutCommand } from '../commands/checkout.command';
import { CheckoutHandler } from './checkout.handler';

const CLINIC_PHONE = '+442071234567';

function cartRow() {
  return {
    id: '0b1f4a2e-9c3d-4f5a-8b7e-1d2c3f4a5b6c',
    status: 'open',
    items: [
      {
        id: '2f6f5f9a-1111-4222-8333-444455556666',
        productId: '3a7a6a9b-1111-4222-8333-444455556666',
        variantId: '4b8b7b9c-1111-4222-8333-444455556666',
        quantity: 2,
        petId: null,
        addedAt: new Date('2026-01-01T00:00:00Z'),
        variant: {
          name: 'Single pipette',
          price: { toString: () => '12.50' },
          currency: 'GBP',
          product: {
            name: 'Flea & Tick Spot-On',
            slug: 'flea-tick-spot-on',
            productType: 'simple',
            requiresPrescription: false,
            isVirtual: false,
            isDownloadable: false,
          },
        },
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
  }): CheckoutHandler {
    const carts = {
      findOpenByUserId: jest.fn().mockResolvedValue(overrides.cart ?? null),
    } as unknown as CartRepository;
    const orders = {
      placeOrder:
        overrides.placeOrder ?? jest.fn().mockResolvedValue('order-id'),
      findByIdempotencyKey: jest.fn(),
      findOwn: jest.fn(),
    } as unknown as OrderRepository;
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
    return new CheckoutHandler(carts, orders, gateway, clinic);
  }

  it('maps a gateway outage to 503 DEPENDENCY_UNAVAILABLE with the clinic phone', async () => {
    const handler = buildHandler({
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
    const handler = buildHandler({
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
    const handler = buildHandler({ cart: null });
    await expectHttpException(
      handler.execute(command),
      400,
      'VALIDATION_FAILED',
      'cart is empty',
    );
  });

  it('maps a lost stock race to 409 STOCK_CHANGED', async () => {
    const handler = buildHandler({
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
});
