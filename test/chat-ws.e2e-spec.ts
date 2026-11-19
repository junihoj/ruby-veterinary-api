import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { io, Socket } from 'socket.io-client';
import { createApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';

interface Frame {
  seq: number;
  type: string;
  role?: string;
  text?: string;
  final?: boolean;
  code?: string;
  state?: string;
  sources?: unknown[];
  messageSeq?: number;
}

interface TurnResult {
  tokens: Frame[];
  citations: Frame[];
  dones: Frame[];
  errors: Frame[];
}

jest.setTimeout(120_000);

describe('Chat WebSocket — frames, safety, handoff (e2e, M6a)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let baseUrl = '';
  const sockets: Socket[] = [];

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

  const createWebSession = async (): Promise<string> => {
    const res = await server().post('/api/v1/chat/session').expect(200);
    return cookieValue(res);
  };

  const makeSocket = (
    auth: Record<string, unknown>,
    cookie?: string,
  ): Socket => {
    const socket = io(`${baseUrl}/chat`, {
      path: '/api/v1/chat/socket.io',
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      autoConnect: false,
      auth,
      ...(cookie
        ? { extraHeaders: { Cookie: `rv_chat_session=${cookie}` } }
        : {}),
    });
    sockets.push(socket);
    return socket;
  };

  const once = <T>(
    socket: Socket,
    event: string,
    timeout = 5_000,
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

  const runTurn = (socket: Socket, text: string): Promise<TurnResult> =>
    new Promise<TurnResult>((resolve, reject) => {
      const tokens: Frame[] = [];
      const citations: Frame[] = [];
      const dones: Frame[] = [];
      const errors: Frame[] = [];
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Turn timed out'));
      }, 8_000);

      const onToken = (frame: Frame) => tokens.push(frame);
      const onCitation = (frame: Frame) => citations.push(frame);
      const onDone = (frame: Frame) => {
        dones.push(frame);
        if (dones.length >= 2) finish();
      };
      const onError = (frame: Frame) => {
        errors.push(frame);
        finish();
      };
      const cleanup = () => {
        clearTimeout(timer);
        socket.off('token', onToken);
        socket.off('citation', onCitation);
        socket.off('done', onDone);
        socket.off('error', onError);
      };
      const finish = () => {
        cleanup();
        resolve({ tokens, citations, dones, errors });
      };

      socket.on('token', onToken);
      socket.on('citation', onCitation);
      socket.on('done', onDone);
      socket.on('error', onError);
      socket.emit('msg', { text });
    });

  const assistantText = (turn: TurnResult): string =>
    turn.tokens
      .filter((frame) => frame.role === 'assistant')
      .map((frame) => frame.text ?? '')
      .join(' ');

  beforeAll(async () => {
    app = (await createApp()) as INestApplication<App>;
    await app.listen(0);
    const url = new URL(await app.getUrl());
    baseUrl = `http://127.0.0.1:${url.port}`;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app.close();
  });

  it('delivers the seq 1 notice on web connect', async () => {
    const cookie = await createWebSession();
    const socket = makeSocket({ last_seen_seq: 0 }, cookie);
    const notice = once<Frame>(socket, 'notice');
    socket.connect();
    const frame = await notice;
    expect(frame.seq).toBe(1);
    expect(frame.text).toContain('emergency');
  });

  it('answers an emergency with the fixed phone response and no LLM/citation', async () => {
    const cookie = await createWebSession();
    const socket = makeSocket({ last_seen_seq: 0 }, cookie);
    const notice = once<Frame>(socket, 'notice');
    socket.connect();
    await notice;

    const turn = await runTurn(
      socket,
      'My dog ate chocolate and is having a seizure',
    );
    const userEcho = turn.tokens.find((frame) => frame.role === 'user');
    expect(userEcho?.text).toContain('chocolate');
    expect(assistantText(turn)).toContain('+2348139640640');
    expect(assistantText(turn)).toContain('emergency');
    expect(turn.citations).toHaveLength(0);
    expect(turn.dones).toHaveLength(2);
  });

  it('answers a private-data request with contact and booking links', async () => {
    const cookie = await createWebSession();
    const socket = makeSocket({ last_seen_seq: 0 }, cookie);
    const notice = once<Frame>(socket, 'notice');
    socket.connect();
    await notice;

    const turn = await runTurn(
      socket,
      'Can you check my appointment time for tomorrow?',
    );
    const text = assistantText(turn);
    expect(text).toContain('+2348139640640');
    expect(text).toContain('https://ruby-veterinary.com');
    expect(text).toContain('https://calendly.com/ezeonyekachukwu97/30min');
    expect(turn.citations).toHaveLength(0);
  });

  it('falls back to the unsure response for weak retrieval', async () => {
    const cookie = await createWebSession();
    const socket = makeSocket({ last_seen_seq: 0 }, cookie);
    const notice = once<Frame>(socket, 'notice');
    socket.connect();
    await notice;

    const turn = await runTurn(socket, 'Do you sell lunar spaceships?');
    const text = assistantText(turn).toLowerCase();
    expect(text).toContain('not sure');
    expect(turn.citations).toHaveLength(0);
  });

  it('moves the session to handoff and stores a requested handover', async () => {
    const cookie = await createWebSession();
    const socket = makeSocket({ last_seen_seq: 0 }, cookie);
    const notice = once<Frame>(socket, 'notice');
    socket.connect();
    await notice;

    const handoffPromise = once<Frame>(socket, 'handoff');
    const donePromise = once<Frame>(socket, 'done');
    socket.emit('handoff');
    const handoff = await handoffPromise;
    await donePromise;

    expect(handoff.state).toBe('requested');
    expect(handoff.seq).toBeGreaterThan(1);

    const session = await prisma.chatSession.findFirst({
      where: { clientType: 'web', status: 'handoff' },
      orderBy: { createdAt: 'desc' },
    });
    expect(session).toBeTruthy();
    expect(session?.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 23 * 3_600_000,
    );

    const conversation = await prisma.conversation.findUnique({
      where: { id: session!.conversationId },
    });
    expect(conversation?.status).toBe('awaiting_handover');

    const handover = await prisma.handoverSession.findFirst({
      where: { conversationId: session!.conversationId },
      orderBy: { requestedAt: 'desc' },
    });
    expect(handover?.status).toBe('requested');
  });

  it('authenticates a mobile socket with the JWT access token', async () => {
    const created = await server()
      .post('/api/v1/chat/session/mobile')
      .expect(200);
    const body = created.body as {
      data: { accessToken: string };
    };
    const socket = makeSocket({
      token: body.data.accessToken,
      last_seen_seq: 0,
    });
    const notice = once<Frame>(socket, 'notice');
    socket.connect();
    const frame = await notice;
    expect(frame.seq).toBe(1);
  });

  it('replays missed messages after last_seen_seq', async () => {
    const cookie = await createWebSession();
    const first = makeSocket({ last_seen_seq: 0 }, cookie);
    const notice = once<Frame>(first, 'notice');
    first.connect();
    await notice;

    const turn = await runTurn(first, 'My cat is bleeding heavily');
    const user = turn.tokens.find((frame) => frame.role === 'user');
    const assistant = turn.tokens.find(
      (frame) => frame.role === 'assistant' && (frame.text ?? '').length > 0,
    );
    expect(user).toBeTruthy();
    expect(assistant).toBeTruthy();
    first.disconnect();

    const second = makeSocket({ last_seen_seq: user!.seq }, cookie);
    const replayToken = once<Frame>(second, 'token');
    const replayDone = once<Frame>(second, 'done');
    second.connect();
    const token = await replayToken;
    const done = await replayDone;
    expect(token.seq).toBe(assistant!.seq);
    expect(token.final).toBe(true);
    expect(done.messageSeq).toBe(assistant!.seq);
    second.disconnect();
  });
});
