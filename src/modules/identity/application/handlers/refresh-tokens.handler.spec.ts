import { HttpException } from '@nestjs/common';
import { RefreshTokensCommand } from '../commands/refresh-tokens.command';
import { RefreshTokensHandler } from './refresh-tokens.handler';
import { LogoutUserHandler } from './logout-user.handler';
import { LogoutUserCommand } from '../commands/logout-user.command';
import { RefreshTokenService } from '../../infrastructure/services/refresh-token.service';
import type {
  SessionRepository,
  SessionRow,
} from '../../infrastructure/repositories/session.repository';
import type {
  UserRepository,
  UserWithRoles,
} from '../../infrastructure/repositories/user.repository';
import type { TokenService } from '../../infrastructure/services/token.service';
import type { AppConfig } from '../../../../config/config.types';

/**
 * Refresh rotation + reuse semantics (ADR-0011, data-model/identity.md):
 * rotate = new session + revoke previous; reuse of a revoked/rotated token
 * = compromise → revoke all user sessions + 401 INVALID_CREDENTIALS.
 */
describe('RefreshTokensHandler', () => {
  const refreshTokens = new RefreshTokenService();
  const userId = '11111111-2222-3333-4444-555555555555';

  /** Only the field the handler reads; 30 days = the shipped default. */
  const config = {
    jwtRefreshTtlSeconds: 30 * 24 * 60 * 60,
  } as AppConfig;

  const user: UserWithRoles = {
    id: userId,
    email: 'user@example.com',
    passwordHash: '$argon2id$fake',
    displayName: 'User',
    phone: null,
    kind: 'client',
    status: 'active',
    lastLoginAt: null,
    roles: ['client'],
  };

  interface SessionCreateInput {
    userId: string;
    refreshTokenHash: string;
    deviceLabel?: string;
    ip?: string;
    userAgent?: string;
    expiresAt: Date;
  }

  interface MockSessions {
    repo: SessionRepository;
    create: jest.Mock<Promise<void>, [SessionCreateInput]>;
    revoke: jest.Mock;
    revokeAllForUser: jest.Mock;
    findByTokenHash: jest.Mock;
  }

  function makeSessions(findResult: SessionRow | null): MockSessions {
    const create = jest
      .fn<Promise<void>, [SessionCreateInput]>()
      .mockResolvedValue(undefined);
    const revoke = jest.fn().mockResolvedValue(undefined);
    const revokeAllForUser = jest.fn().mockResolvedValue(undefined);
    const findByTokenHash = jest.fn().mockResolvedValue(findResult);
    const repo = { create, revoke, revokeAllForUser, findByTokenHash };
    return {
      repo: repo as unknown as SessionRepository,
      create,
      revoke,
      revokeAllForUser,
      findByTokenHash,
    };
  }

  function makeUsers(result: UserWithRoles | null) {
    const findById = jest.fn().mockResolvedValue(result);
    return {
      repo: { findById } as unknown as UserRepository,
      findById,
    };
  }

  function makeTokens() {
    const signAccessToken = jest.fn().mockReturnValue({
      token: 'signed-access',
      expiresIn: 900,
    });
    return {
      service: { signAccessToken } as unknown as TokenService,
      signAccessToken,
    };
  }

  function activeSession(token: string): SessionRow {
    return {
      id: 'ses-1',
      userId,
      refreshTokenHash: refreshTokens.hash(token),
      deviceLabel: null,
      ip: null,
      userAgent: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
    };
  }

  function handler(
    sessions: MockSessions,
    users: ReturnType<typeof makeUsers>,
    tokens: ReturnType<typeof makeTokens>,
  ): RefreshTokensHandler {
    return new RefreshTokensHandler(
      users.repo,
      sessions.repo,
      tokens.service,
      refreshTokens,
      config,
    );
  }

  function errCode(err: unknown): { status: number; code: string } {
    const e = err as HttpException;
    return {
      status: e.getStatus(),
      code: (e.getResponse() as { code: string }).code,
    };
  }

  it('rotates: creates a new session and revokes the presented one', async () => {
    const token = refreshTokens.generate();
    const sessions = makeSessions(activeSession(token));
    const users = makeUsers(user);
    const tokens = makeTokens();

    const result = await handler(sessions, users, tokens).execute(
      new RefreshTokensCommand(token),
    );

    expect(sessions.create).toHaveBeenCalledTimes(1);
    expect(sessions.revoke).toHaveBeenCalledWith('ses-1');
    expect(sessions.revokeAllForUser).not.toHaveBeenCalled();

    // The new session stores a hash of the NEW token, never the token itself.
    const created = sessions.create.mock.calls[0][0];
    expect(created.userId).toBe(userId);
    expect(created.refreshTokenHash).toBe(
      refreshTokens.hash(result.tokens.refreshToken),
    );
    expect(result.tokens.refreshToken).not.toBe(token);
    expect(result.tokens.accessToken).toBe('signed-access');
    expect(tokens.signAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ sub: userId, roles: ['client'] }),
    );
  });

  it('reuse of a revoked/rotated token revokes ALL sessions + 401', async () => {
    const token = refreshTokens.generate();
    const reused = activeSession(token);
    reused.revokedAt = new Date(Date.now() - 1000);
    const sessions = makeSessions(reused);
    const users = makeUsers(user);
    const tokens = makeTokens();

    const err = await handler(sessions, users, tokens)
      .execute(new RefreshTokensCommand(token))
      .catch((e: unknown) => e);

    expect(errCode(err)).toEqual({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(userId);
    expect(sessions.create).not.toHaveBeenCalled();
    expect(sessions.revoke).not.toHaveBeenCalled();
  });

  it('unknown token → 401 INVALID_CREDENTIALS without revoking anything', async () => {
    const sessions = makeSessions(null);
    const users = makeUsers(user);
    const tokens = makeTokens();

    const err = await handler(sessions, users, tokens)
      .execute(new RefreshTokensCommand(refreshTokens.generate()))
      .catch((e: unknown) => e);

    expect(errCode(err)).toEqual({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('expired session → 401 TOKEN_EXPIRED (distinct from invalid)', async () => {
    const token = refreshTokens.generate();
    const expired = activeSession(token);
    expired.expiresAt = new Date(Date.now() - 1000);
    const sessions = makeSessions(expired);
    const users = makeUsers(user);
    const tokens = makeTokens();

    const err = await handler(sessions, users, tokens)
      .execute(new RefreshTokensCommand(token))
      .catch((e: unknown) => e);

    expect(errCode(err)).toEqual({ status: 401, code: 'TOKEN_EXPIRED' });
    expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('deleted/suspended user → 401 INVALID_CREDENTIALS', async () => {
    const token = refreshTokens.generate();
    const sessions = makeSessions(activeSession(token));
    const suspended: UserWithRoles = { ...user, status: 'suspended' };
    const users = makeUsers(suspended);
    const tokens = makeTokens();

    const err = await handler(sessions, users, tokens)
      .execute(new RefreshTokensCommand(token))
      .catch((e: unknown) => e);

    expect(errCode(err)).toEqual({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(sessions.create).not.toHaveBeenCalled();
  });
});

describe('LogoutUserHandler', () => {
  const refreshTokens = new RefreshTokenService();

  it('revokes an active session', async () => {
    const token = refreshTokens.generate();
    const revoke = jest.fn().mockResolvedValue(undefined);
    const findByTokenHash = jest.fn().mockResolvedValue({
      id: 'ses-1',
      userId: 'u',
      refreshTokenHash: refreshTokens.hash(token),
      deviceLabel: null,
      ip: null,
      userAgent: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
    });
    const sessions = {
      findByTokenHash,
      revoke,
    } as unknown as SessionRepository;

    await new LogoutUserHandler(sessions, refreshTokens).execute(
      new LogoutUserCommand(token),
    );
    expect(revoke).toHaveBeenCalledWith('ses-1');
  });

  it('is idempotent for unknown tokens (still resolves)', async () => {
    const revoke = jest.fn();
    const findByTokenHash = jest.fn().mockResolvedValue(null);
    const sessions = {
      findByTokenHash,
      revoke,
    } as unknown as SessionRepository;

    await expect(
      new LogoutUserHandler(sessions, refreshTokens).execute(
        new LogoutUserCommand(refreshTokens.generate()),
      ),
    ).resolves.toBeUndefined();
    expect(revoke).not.toHaveBeenCalled();
  });
});
