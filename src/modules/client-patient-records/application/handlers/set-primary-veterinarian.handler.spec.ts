import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { IdentityFacadePort } from '../../../identity/application/facades/identity-facade-port';
import { PetRepository } from '../../infrastructure/repositories/pet.repository';
import { SetPrimaryVeterinarianHandler } from './set-primary-veterinarian.handler';
import { SetPrimaryVeterinarianCommand } from '../commands/set-primary-veterinarian.command';

function petRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '0b1f4a2e-9c3d-4f5a-8b7e-1d2c3f4a5b6c',
    clientId: '1c2d3e4f-5a6b-7c8d-9e0f-1a2b3c4d5e6f',
    name: 'Biscuit',
    species: 'dog',
    breed: null,
    sex: null,
    neutered: null,
    dateOfBirth: null,
    weightKg: null,
    microchipId: null,
    notes: null,
    status: 'active',
    photoObjectKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function linkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '3f4e5d6c-7b8a-9c0d-1e2f-3a4b5c6d7e8f',
    petId: '0b1f4a2e-9c3d-4f5a-8b7e-1d2c3f4a5b6c',
    veterinarianUserId: '2f6f5f9a-1111-4222-8333-444455556666',
    effectiveFrom: new Date('2026-01-05T00:00:00.000Z'),
    effectiveTo: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function vetUser(overrides: Record<string, unknown> = {}) {
  return {
    id: '2f6f5f9a-1111-4222-8333-444455556666',
    email: 'ada@ruby-veterinary.example.com',
    displayName: 'Dr. Ada Lovelace',
    kind: 'staff' as const,
    roles: ['veterinarian'],
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

describe('SetPrimaryVeterinarianHandler', () => {
  const findById = jest.fn() as jest.MockedFunction<PetRepository['findById']>;
  const setPrimaryVeterinarian = jest.fn() as jest.MockedFunction<
    PetRepository['setPrimaryVeterinarian']
  >;
  const getUserById = jest.fn() as jest.MockedFunction<
    IdentityFacadePort['getUserById']
  >;
  const resolveRoles = jest.fn() as jest.MockedFunction<
    IdentityFacadePort['resolveRoles']
  >;
  let handler: SetPrimaryVeterinarianHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    const pets = {
      findById,
      setPrimaryVeterinarian,
    } as unknown as PetRepository;
    const identity = {
      getUserById,
      resolveRoles,
    } as unknown as IdentityFacadePort;
    handler = new SetPrimaryVeterinarianHandler(pets, identity);
  });

  it('opens a new current link and closes the previous one in one transaction', async () => {
    const petUuid = randomUUID();
    const vetUuid = randomUUID();
    const petId = PrefixedId.format('pet', petUuid);
    const vetId = PrefixedId.format('user', vetUuid);
    findById.mockResolvedValue(petRow({ id: petUuid }));
    getUserById.mockResolvedValue(vetUser({ id: vetUuid }));
    resolveRoles.mockResolvedValue(['veterinarian']);
    setPrimaryVeterinarian.mockResolvedValue(
      linkRow({ veterinarianUserId: vetUuid }),
    );

    const result = await handler.execute(
      new SetPrimaryVeterinarianCommand(petId, {
        veterinarianUserId: vetId,
        effectiveFrom: '2026-02-01',
      }),
    );

    expect(setPrimaryVeterinarian).toHaveBeenCalledWith(
      petUuid,
      vetUuid,
      new Date('2026-02-01'),
    );
    expect(result.veterinarianUserId).toBe(vetId);
    expect(result.effectiveTo).toBeNull();
  });

  it('answers 422 NOT_A_VETERINARIAN when the target lacks the role', async () => {
    const petUuid = randomUUID();
    const vetUuid = randomUUID();
    findById.mockResolvedValue(petRow({ id: petUuid }));
    getUserById.mockResolvedValue(vetUser({ id: vetUuid }));
    resolveRoles.mockResolvedValue(['receptionist']);

    await expectHttpException(
      handler.execute(
        new SetPrimaryVeterinarianCommand(PrefixedId.format('pet', petUuid), {
          veterinarianUserId: PrefixedId.format('user', vetUuid),
        }),
      ),
      422,
      'NOT_A_VETERINARIAN',
    );
    expect(setPrimaryVeterinarian).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown veterinarian user', async () => {
    const petUuid = randomUUID();
    findById.mockResolvedValue(petRow({ id: petUuid }));
    getUserById.mockResolvedValue(null);

    await expectHttpException(
      handler.execute(
        new SetPrimaryVeterinarianCommand(PrefixedId.format('pet', petUuid), {
          veterinarianUserId: 'usr_unknown',
        }),
      ),
      404,
      'RESOURCE_NOT_FOUND',
    );
  });
});
