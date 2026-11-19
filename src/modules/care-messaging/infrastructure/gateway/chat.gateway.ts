import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { APP_CONFIG, type AppConfig } from '../../../../config/config.types';
import { ChatSessionAuthService } from '../../application/services/chat-session-auth.service';
import { ChatSessionRepository } from '../repositories/chat-session.repository';
import { ReplayChatHandler } from '../../application/handlers/replay-chat.handler';
import { SendChatMessageHandler } from '../../application/handlers/send-chat-message.handler';
import { RequestChatHandoffHandler } from '../../application/handlers/request-chat-handoff.handler';
import { WS_ERROR } from '../../application/errors';
import type {
  ChatFrame,
  ExpiredFrame,
} from '../../application/dto/chat.frames';
import type { ResolvedChatSession } from '../../application/dto/chat.types';

const roomFor = (sessionId: string) => `session:${sessionId}`;

@WebSocketGateway({
  namespace: '/chat',
  path: '/api/v1/chat/socket.io',
  transports: ['websocket'],
  pingInterval: 25_000,
  pingTimeout: 60_000,
  cors: { origin: true, credentials: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly auth: ChatSessionAuthService,
    private readonly sessions: ChatSessionRepository,
    private readonly replay: ReplayChatHandler,
    private readonly send: SendChatMessageHandler,
    private readonly handoff: RequestChatHandoffHandler,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const origin = client.handshake.headers.origin;
    if (origin && !this.config.corsOrigins.includes(origin)) {
      client.emit('error', this.errorFrame(0, WS_ERROR.UNAUTHORIZED));
      client.disconnect(true);
      return;
    }

    const resolved = await this.auth.resolveHandshake(
      client.handshake.headers.cookie,
      client.handshake.auth,
    );
    if (!resolved.ok) {
      if (resolved.reason === 'expired') {
        client.emit('expired', this.expiredFrame());
      } else {
        client.emit('error', this.errorFrame(0, WS_ERROR.UNAUTHORIZED));
      }
      client.disconnect(true);
      return;
    }

    const context = resolved.context;
    (client.data as { sessionId?: string }).sessionId = context.session.id;
    await client.join(roomFor(context.session.id));

    const requested = Number(client.handshake.auth?.last_seen_seq ?? 0);
    const afterSeq =
      Number.isFinite(requested) && requested > 0 ? requested : 0;
    const frames = await this.replay.execute(context, afterSeq);
    for (const frame of frames) {
      client.emit(frame.type, frame);
    }
    await this.sessions.touch(context.session.id);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const sessionId = (client.data as { sessionId?: string }).sessionId;
    if (!sessionId) return;
    try {
      await this.sessions.touch(sessionId);
    } catch {
      // Session may already be gone; disconnect must never throw.
    }
  }

  @SubscribeMessage('msg')
  async onMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { text?: unknown },
  ): Promise<void> {
    const context = await this.resolveContext(client);
    if (!context) return;

    const text = typeof body?.text === 'string' ? body.text : '';
    await this.send.execute({
      context,
      text,
      ip: this.clientIp(client),
      requestId: client.id,
      emit: (frame) => this.broadcast(context.session.id, frame),
    });
  }

  @SubscribeMessage('handoff')
  async onHandoff(@ConnectedSocket() client: Socket): Promise<void> {
    const context = await this.resolveContext(client);
    if (!context) return;
    await this.handoff.execute(context, (frame) =>
      this.broadcast(context.session.id, frame),
    );
  }

  private async resolveContext(
    client: Socket,
  ): Promise<ResolvedChatSession | null> {
    const resolved = await this.auth.resolveHandshake(
      client.handshake.headers.cookie,
      client.handshake.auth,
    );
    if (resolved.ok) return resolved.context;

    if (resolved.reason === 'expired') {
      client.emit('expired', this.expiredFrame());
      client.disconnect(true);
      return null;
    }

    client.emit('error', this.errorFrame(0, WS_ERROR.UNAUTHORIZED));
    client.disconnect(true);
    return null;
  }

  /**
   * Bridge entry point for non-WS transports (Telegram webhook). Broadcasts to
   * every socket currently attached to the visitor's session.
   */
  broadcastToSession(sessionId: string, frame: ChatFrame): void {
    this.broadcast(sessionId, frame);
  }

  private broadcast(sessionId: string, frame: ChatFrame): void {
    this.server?.to(roomFor(sessionId)).emit(frame.type, frame);
  }

  private errorFrame(seq: number, code: string): ChatFrame {
    return { seq, type: 'error', code };
  }

  private expiredFrame(): ExpiredFrame {
    return {
      seq: 0,
      type: 'expired',
      contact: {
        phone: this.config.clinic.phone,
        formUrl: this.config.clinic.contactUrl,
        bookingUrl: this.config.clinic.bookingUrl,
      },
    };
  }

  private clientIp(client: Socket): string {
    if (this.config.trustProxy) {
      const forwarded = client.handshake.headers['x-forwarded-for'];
      if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
      }
    }
    return client.handshake.address || 'unknown';
  }
}
