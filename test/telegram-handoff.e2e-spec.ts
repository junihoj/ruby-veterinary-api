import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { io, Socket } from 'socket.io-client';
import { createApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { ChatSessionSweeper } from '../src/modules/care-messaging/application/jobs/chat-session-sweeper.service';

interface Frame {
  seq: number;
  type: string;
  state?: string;
  staffName?: string;
  text?: string;
  senderName?: string;
  contact?: { phone?: string };
}

interface TelegramCall {
  method: string;
  payload: Record<string, unknown>;
}

jest.setTimeout(120_000);

describe('Telegram handoff — webhook, topics, staff bridge (e2e, M6b)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let sweeper: ChatSessionSweeper;
  let mock: Server;
  let baseUrl = '';
  let groupId = '';
  const secret = 'test-telegram-secret';
  const calls: TelegramCall[] = [];
  const sockets: Socket[] = [];
  const originalEnv = {
    bot: process.env.TELEGRAM_BOT_TOKEN,
    group: process.env.TELEGRAM_FORUM_GROUP_ID,
    secret: process.env.TELEGRAM_WEBHOOK_SECRET,
    base: process.env.TELEGRAM_API_BASE_URL,
  };
  // Run-scoped ids: the test database persists across runs, so fixed ids
  // would collide with provider_threads / webhook_updates from earlier runs.
  let topicSequence = 0;
  const updateBase = 1_000_000 + Math.floor(Math.random() * 8_000_000);

  const server = () => request(app.getHttpServer());

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

  const createWebSession = async (): Promise<{
    cookie: string;
    sessionId: string;
  }> => {
    const res = await server().post('/api/v1/chat/session').expect(200);
    const body = res.body as { data: { sessionId: string } };
    return { cookie: cookieValue(res), sessionId: body.data.sessionId };
  };

  const makeSocket = (
    auth: Record<string, unknown>,
    cookie: string,
  ): Socket => {
    const socket = io(`${baseUrl}/chat`, {
      path: '/api/v1/chat/socket.io',
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      autoConnect: false,
      auth,
      extraHeaders: { Cookie: `rv_chat_session=${cookie}` },
    });
    sockets.push(socket);
    return socket;
  };

  const once = <T>(
    socket: Socket,
    event: string,
    timeout = 8_000,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        reject(new Error(`Timed out waiting for "${event}"`));
      }, timeout);
      const handler = (payload: T) => {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      };
      socket.on(event, handler);
    });

  const connect = async (socket: Socket): Promise<Frame> => {
    const notice = once<Frame>(socket, 'notice');
    socket.connect();
    return notice;
  };

  const startHandoff = async (
    socket: Socket,
    expectedSessionId: string,
  ): Promise<{
    requested: Frame;
    session: { id: string; conversationId: string };
  }> => {
    const requested = once<Frame>(socket, 'handoff');
    const done = once<Frame>(socket, 'done');
    socket.emit('handoff');
    const frame = await requested;
    await done;
    const session = await prisma.chatSession.findUniqueOrThrow({
      where: { id: expectedSessionId },
    });
    expect(session.status).toBe('handoff');
    return {
      requested: frame,
      session: { id: session.id, conversationId: session.conversationId },
    };
  };

  const postUpdate = (update: unknown, providedSecret = secret) =>
    server()
      .post('/api/v1/webhooks/telegram')
      .set('X-Telegram-Bot-Api-Secret-Token', providedSecret)
      .send(update as object);

  const telegramMessage = (
    updateOffset: number,
    threadId: string,
    text: string,
  ) => ({
    update_id: updateBase + updateOffset,
    message: {
      message_id: updateOffset,
      message_thread_id: Number(threadId),
      is_topic_message: true,
      text,
      chat: { id: groupId, type: 'supergroup' },
      from: {
        id: 4242,
        is_bot: false,
        first_name: 'Ada',
        last_name: 'Okafor',
        username: 'ada_vet',
      },
    },
  });

  beforeAll(async () => {
    // Minimal Bot API double: exercises the real adapter (fetch, JSON shapes,
    // message_thread_id mapping) without touching Telegram.
    mock = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        const method = req.url?.split('/').pop() ?? '';
        const payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        calls.push({ method, payload });

        let result: unknown = true;
        if (method === 'createForumTopic') {
          topicSequence += 1;
          result = { message_thread_id: topicSequence, name: payload.name };
        } else if (method === 'sendMessage') {
          result = { message_id: calls.length };
        }

        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      });
    });
    await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
    const address = mock.address() as AddressInfo;

    groupId = '-1001234567890';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.TELEGRAM_FORUM_GROUP_ID = groupId;
    process.env.TELEGRAM_WEBHOOK_SECRET = secret;
    process.env.TELEGRAM_API_BASE_URL = `http://127.0.0.1:${address.port}`;

    app = (await createApp()) as INestApplication<App>;
    await app.listen(0);
    const url = new URL(await app.getUrl());
    baseUrl = `http://127.0.0.1:${url.port}`;
    prisma = app.get(PrismaService);
    sweeper = app.get(ChatSessionSweeper);
    topicSequence = 500_000 + Math.floor(Math.random() * 400_000);
    await prisma.webhookUpdate.deleteMany({ where: { provider: 'telegram' } });
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app.close();
    await new Promise<void>((resolve) => mock.close(() => resolve()));

    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('TELEGRAM_BOT_TOKEN', originalEnv.bot);
    restore('TELEGRAM_FORUM_GROUP_ID', originalEnv.group);
    restore('TELEGRAM_WEBHOOK_SECRET', originalEnv.secret);
    restore('TELEGRAM_API_BASE_URL', originalEnv.base);
  });

  it('rejects a webhook with a missing or wrong secret', async () => {
    await postUpdate({ update_id: 1 }, 'wrong-secret').expect(401);
    await server()
      .post('/api/v1/webhooks/telegram')
      .send({ update_id: 1 })
      .expect(401);
  });

  it('creates a forum topic when a visitor requests a human', async () => {
    const { cookie, sessionId } = await createWebSession();
    const socket = makeSocket({ last_seen_seq: 0 }, cookie);
    await connect(socket);

    const { requested, session } = await startHandoff(socket, sessionId);
    expect(requested.state).toBe('requested');

    const topic = calls.find((call) => call.method === 'createForumTopic');
    expect(topic).toBeTruthy();
    expect(topic!.payload.chat_id).toBe(groupId);
    expect(String(topic!.payload.name)).toContain('Web chat');

    const intro = calls.find(
      (call) =>
        call.method === 'sendMessage' &&
        call.payload.message_thread_id === topicSequence,
    );
    expect(intro).toBeTruthy();
    expect(String(intro!.payload.text)).toContain('New web chat handoff');
    expect(String(intro!.payload.text)).toContain('/claim');

    const thread = await prisma.providerThread.findUnique({
      where: {
        conversationId_provider: {
          conversationId: session.conversationId,
          provider: 'telegram',
        },
      },
    });
    expect(thread?.providerThreadId).toBe(String(topicSequence));

    const handover = await prisma.handoverSession.findFirst({
      where: { conversationId: session.conversationId },
      orderBy: { requestedAt: 'desc' },
    });
    expect(handover?.providerThreadId).toBe(String(topicSequence));
    expect(handover?.status).toBe('requested');
  });

  it('claims, bridges staff messages, notes, closes, and dedupes updates', async () => {
    const { cookie, sessionId } = await createWebSession();
    const socket = makeSocket({ last_seen_seq: 0 }, cookie);
    await connect(socket);
    const { session } = await startHandoff(socket, sessionId);

    const thread = await prisma.providerThread.findUniqueOrThrow({
      where: {
        conversationId_provider: {
          conversationId: session.conversationId,
          provider: 'telegram',
        },
      },
    });
    const threadId = thread.providerThreadId;

    // /claim → accepted frame + human_active + claimer metadata
    const accepted = once<Frame>(socket, 'handoff');
    await postUpdate(telegramMessage(1001, threadId, '/claim')).expect(200);
    const acceptedFrame = await accepted;
    expect(acceptedFrame.state).toBe('accepted');
    expect(acceptedFrame.staffName).toBe('Ada Okafor');

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: session.conversationId },
    });
    expect(conversation.status).toBe('human_active');

    const claimed = await prisma.providerThread.findUniqueOrThrow({
      where: { id: thread.id },
    });
    const metadata = claimed.metadata as {
      claimed_by?: { name?: string };
    };
    expect(metadata.claimed_by?.name).toBe('Ada Okafor');

    // Re-delivery of the same update_id is idempotent.
    const beforeDuplicate = calls.length;
    await postUpdate(telegramMessage(1001, threadId, '/claim')).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(calls.length).toBe(beforeDuplicate);

    // Plain staff text bridges to the visitor stream.
    const staffFrame = once<Frame>(socket, 'staff_message');
    await postUpdate(
      telegramMessage(1002, threadId, 'Hi, I can help with that.'),
    ).expect(200);
    const bridged = await staffFrame;
    expect(bridged.text).toBe('Hi, I can help with that.');
    expect(bridged.senderName).toBe('Ada Okafor');

    const stored = await prisma.inboxMessage.findFirst({
      where: { sessionId, frameType: 'staff_message' },
      orderBy: { seq: 'desc' },
    });
    expect(stored?.bodyText).toBe('Hi, I can help with that.');
    expect(stored?.senderType).toBe('staff');

    // /note is internal: no visitor frame, no transcript row.
    const beforeNote = await prisma.inboxMessage.count({
      where: { sessionId },
    });
    await postUpdate(
      telegramMessage(1003, threadId, '/note Owner prefers a call after 5pm.'),
    ).expect(200);
    const noted = await prisma.providerThread.findUniqueOrThrow({
      where: { id: thread.id },
    });
    const notes = (noted.metadata as { notes?: unknown[] }).notes;
    expect(notes).toHaveLength(1);
    expect(await prisma.inboxMessage.count({ where: { sessionId } })).toBe(
      beforeNote,
    );

    // /close → closed frame, archived topic, terminal session.
    const closed = once<Frame>(socket, 'handoff');
    await postUpdate(telegramMessage(1004, threadId, '/close resolved')).expect(
      200,
    );
    expect((await closed).state).toBe('closed');

    expect(
      calls.some(
        (call) =>
          call.method === 'closeForumTopic' &&
          call.payload.message_thread_id === Number(threadId),
      ),
    ).toBe(true);

    const resolved = await prisma.handoverSession.findFirstOrThrow({
      where: { conversationId: session.conversationId },
      orderBy: { requestedAt: 'desc' },
    });
    expect(resolved.status).toBe('resolved');
    expect(resolved.closedReason).toBe('resolved');

    const closedSession = await prisma.chatSession.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(closedSession.status).toBe('closed');

    const closedConversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: session.conversationId },
    });
    expect(closedConversation.status).toBe('closed');

    // Reconnecting a closed session yields the expired frame + clinic contact.
    const reconnect = makeSocket({ last_seen_seq: 0 }, cookie);
    const expired = once<Frame>(reconnect, 'expired');
    reconnect.connect();
    const expiredFrame = await expired;
    expect(expiredFrame.contact?.phone).toBe('+2348139640640');
  });

  it('expires a handoff session after the 24 h window and replays nothing', async () => {
    const { cookie, sessionId } = await createWebSession();
    const socket = makeSocket({ last_seen_seq: 0 }, cookie);
    await connect(socket);
    await startHandoff(socket, sessionId);

    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 25 * 3_600_000) },
    });
    await sweeper.sweep();

    const reconnect = makeSocket({ last_seen_seq: 0 }, cookie);
    const expired = once<Frame>(reconnect, 'expired');
    reconnect.connect();
    const frame = await expired;
    expect(frame.contact?.phone).toBe('+2348139640640');

    expect(await prisma.inboxMessage.count({ where: { sessionId } })).toBe(0);
  });
});
