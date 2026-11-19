import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { CHAT_NOTICE } from '../src/modules/care-messaging/application/services/safe-responses';

interface Envelope<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}

interface ChatSessionResponse {
  sessionId: string;
  seq: number;
  expiresAt: string;
}

interface MobileSessionResponse {
  sessionId: string;
  sessionToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface MessagesResponse {
  messages: Array<{
    id: string;
    seq: number;
    senderType: string;
    frameType: string;
    body: string;
  }>;
}

jest.setTimeout(120_000);

describe('Chat sessions — REST auth + lifecycle (e2e, M6a)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const server = () => request(app.getHttpServer());
  const post = (path: string) => server().post(`/api/v1${path}`);
  const get = (path: string) => server().get(`/api/v1${path}`);

  const cookieValue = (res: request.Response): string => {
    const header = res.headers['set-cookie'] as string[] | string | undefined;
    const cookies: string[] = Array.isArray(header)
      ? header
      : header
        ? [header]
        : [];
    const found = cookies.find((cookie) =>
      cookie.startsWith('rv_chat_session='),
    );
    if (!found) throw new Error('rv_chat_session cookie missing');
    return found.split(';')[0].split('=').slice(1).join('=');
  };

  beforeAll(async () => {
    app = (await createApp()) as INestApplication<App>;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a web session from a disallowed Origin', async () => {
    await post('/chat/session')
      .set('Origin', 'https://evil.example')
      .expect(403);
  });

  it('creates a web session, sets the HttpOnly cookie, and records notice seq 1', async () => {
    const res = await post('/chat/session').expect(200);
    const body = res.body as Envelope<ChatSessionResponse>;
    expect(body.data.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(body.data.seq).toBe(0);
    expect(body.data.expiresAt).toBeTruthy();

    const cookie = cookieValue(res);
    const row = await prisma.chatSession.findUnique({
      where: { id: body.data.sessionId },
    });
    expect(row?.status).toBe('active');
    expect(Number(row?.lastSeq)).toBe(1);

    const messages = await get('/chat/messages')
      .set('Cookie', `rv_chat_session=${cookie}`)
      .expect(200);
    const data = messages.body as Envelope<MessagesResponse>;
    expect(data.data.messages).toHaveLength(1);
    expect(data.data.messages[0]).toMatchObject({
      seq: 1,
      senderType: 'system',
      frameType: 'system',
      body: CHAT_NOTICE,
    });
  });

  it('rejects message replay without a session', async () => {
    await get('/chat/messages').expect(401);
  });

  it('creates a mobile session and rotates the refresh token', async () => {
    const created = await post('/chat/session/mobile').expect(200);
    const body = created.body as Envelope<MobileSessionResponse>;
    expect(body.data.sessionId).toBeTruthy();
    expect(body.data.sessionToken).toBeTruthy();
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.refreshToken).toBeTruthy();
    expect(body.data.expiresIn).toBe(1800);

    const refreshed = await post('/chat/token/refresh')
      .set('Authorization', `Bearer ${body.data.refreshToken}`)
      .expect(200);
    const next = refreshed.body as Envelope<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }>;
    expect(next.data.accessToken).toBeTruthy();
    expect(next.data.refreshToken).not.toBe(body.data.refreshToken);
    expect(next.data.expiresIn).toBe(1800);

    // Old refresh token is single-use.
    await post('/chat/token/refresh')
      .set('Authorization', `Bearer ${body.data.refreshToken}`)
      .expect(401);

    // New token still resolves the session.
    const replay = await get('/chat/messages')
      .set('Authorization', `Bearer ${next.data.refreshToken}`)
      .expect(200);
    expect(
      (replay.body as Envelope<MessagesResponse>).data.messages.length,
    ).toBeGreaterThan(0);
  });

  it('rejects a session whose TTL has elapsed', async () => {
    const created = await post('/chat/session').expect(200);
    const body = created.body as Envelope<ChatSessionResponse>;
    const cookie = cookieValue(created);

    await prisma.chatSession.update({
      where: { id: body.data.sessionId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await get('/chat/messages')
      .set('Cookie', `rv_chat_session=${cookie}`)
      .expect(401);
  });
});
