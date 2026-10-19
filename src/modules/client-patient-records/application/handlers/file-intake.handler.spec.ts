import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { FileIntakeCommand } from '../commands/file-intake.command';
import { FileIntakeHandler } from './file-intake.handler';
import { ClientRepository } from '../../infrastructure/repositories/client.repository';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';
import { DuplicateUserLinkError } from '../../infrastructure/errors';

const PET_DRAFT = {
  name: 'Biscuit',
  species: 'dog',
  breed: 'Border Terrier',
  sex: 'male',
  neutered: true,
};

function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '0b1f4a2e-9c3d-4f5a-8b7e-1d2c3f4a5b6c',
    userId: null,
    displayName: 'Mabel Whitcombe',
    email: null,
    phone: '+442079991234',
    addressLine1: null,
    addressLine2: null,
    city: null,
    postalCode: null,
    country: null,
    preferredContact: 'phone',
    source: 'walk_in',
    status: 'active',
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function petRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '1c2d3e4f-5a6b-7c8d-9e0f-1a2b3c4d5e6f',
    clientId: '0b1f4a2e-9c3d-4f5a-8b7e-1d2c3f4a5b6c',
    name: 'Biscuit',
    species: 'dog',
    breed: 'Border Terrier',
    sex: 'male',
    neutered: true,
    dateOfBirth: null,
    weightKg: new Prisma.Decimal('8.40'),
    microchipId: null,
    notes: null,
    status: 'active',
    photoObjectKey: null,
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

describe('FileIntakeHandler (Flow 2 filing)', () => {
  const findById = jest.fn() as jest.MockedFunction<
    ClientRepository['findById']
  >;
  const attachPets = jest.fn() as jest.MockedFunction<
    ClientRepository['attachPets']
  >;
  const createFromIntake = jest.fn() as jest.MockedFunction<
    ClientRepository['createFromIntake']
  >;
  let handler: FileIntakeHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    const clients = {
      findById,
      attachPets,
      createFromIntake,
    } as unknown as ClientRepository;
    const pets = {} as PetRepository;
    handler = new FileIntakeHandler(clients, pets);
  });

  it('files pets under an existing client when clientId is given', async () => {
    const clientUuid = randomUUID();
    const clientId = PrefixedId.format('client', clientUuid);
    findById.mockResolvedValue(clientRow({ id: clientUuid }));
    attachPets.mockResolvedValue([petRow()]);

    const result = await handler.execute(
      new FileIntakeCommand(
        clientId,
        null,
        {
          displayName: 'Mabel Whitcombe',
          email: 'mabel@example.com',
          phone: '+442079991234',
          addressLine1: null,
          addressLine2: null,
          city: null,
          postalCode: null,
          country: null,
        },
        [PET_DRAFT],
      ),
    );

    expect(result.clientId).toBe(clientId);
    expect(result.pets[0].name).toBe('Biscuit');
    expect(attachPets).toHaveBeenCalledWith(clientUuid, [
      expect.objectContaining({ name: 'Biscuit', species: 'dog' }),
    ]);
    expect(createFromIntake).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown existing client', async () => {
    findById.mockResolvedValue(null);

    await expectHttpException(
      handler.execute(
        new FileIntakeCommand(
          'cli_unknown',
          null,
          {
            displayName: 'Mabel Whitcombe',
            email: 'mabel@example.com',
            phone: '+442079991234',
            addressLine1: null,
            addressLine2: null,
            city: null,
            postalCode: null,
            country: null,
          },
          [PET_DRAFT],
        ),
      ),
      404,
      'RESOURCE_NOT_FOUND',
    );
  });

  it('creates the client and pets in one transaction for new-client intakes', async () => {
    const clientUuid = randomUUID();
    const petUuid = randomUUID();
    createFromIntake.mockResolvedValue({
      client: clientRow({ id: clientUuid, userId: 'usr-1' }),
      pets: [petRow({ id: petUuid })],
    });

    const result = await handler.execute(
      new FileIntakeCommand(
        null,
        'usr-1',
        {
          displayName: 'Mabel Whitcombe',
          email: 'mabel@example.com',
          phone: '+442079991234',
          addressLine1: null,
          addressLine2: null,
          city: null,
          postalCode: null,
          country: null,
        },
        [PET_DRAFT],
      ),
    );

    expect(result.clientId).toBe(PrefixedId.format('client', clientUuid));
    expect(createFromIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'usr-1',
        source: 'intake',
        preferredContact: 'phone',
      }),
      [expect.objectContaining({ name: 'Biscuit' })],
    );
  });

  it('maps a duplicate user link to 409 ALREADY_LINKED', async () => {
    createFromIntake.mockRejectedValue(new DuplicateUserLinkError());

    await expectHttpException(
      handler.execute(
        new FileIntakeCommand(
          null,
          'usr-1',
          {
            displayName: 'Mabel Whitcombe',
            email: 'mabel@example.com',
            phone: '+442079991234',
            addressLine1: null,
            addressLine2: null,
            city: null,
            postalCode: null,
            country: null,
          },
          [PET_DRAFT],
        ),
      ),
      409,
      'ALREADY_LINKED',
    );
  });
});
