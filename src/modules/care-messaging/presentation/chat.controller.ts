import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../../config/config.types';
import { Public } from '../../../shared/cross-cutting/decorators';
import { ChatSessionAuthService } from '../application/services/chat-session-auth.service';
import { ChatRateLimiter } from '../application/services/rate-limiter.service';
import { StartChatSessionHandler } from '../application/handlers/start-chat-session.handler';
import { RefreshChatTokenHandler } from '../application/handlers/refresh-chat-token.handler';
import { ListChatMessagesHandler } from '../application/handlers/list-chat-messages.handler';
import {
  originNotAllowed,
  rateLimited,
  validationFailed,
} from '../application/errors';
import { ChatSessionGuard, type ChatRequest } from './chat-session.guard';

@ApiTags('Chat Sessions')
@Controller('chat')
export class ChatController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly startSession: StartChatSessionHandler,
    private readonly refreshToken: RefreshChatTokenHandler,
    private readonly listMessages: ListChatMessagesHandler,
    private readonly auth: ChatSessionAuthService,
    private readonly limiter: ChatRateLimiter,
  ) {}

  @Public()
  @Post('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'createWebChatSession',
    summary: 'Create a web chat session',
  })
  @ApiOkResponse({ description: 'Session created' })
  @ApiForbiddenResponse({ description: 'Origin not allowed' })
  @ApiTooManyRequestsResponse({ description: 'Rate limited' })
  async createWebSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertOrigin(req);
    this.assertCreateRate(req);

    const result = await this.startSession.execute({ clientType: 'web' });
    const cookie = this.auth.sessionCookie(
      result.token,
      this.config.chat.sessionTtlMinutes * 60,
    );
    res.cookie(cookie.name, cookie.value, cookie.options);

    return {
      sessionId: result.sessionId,
      seq: result.seq,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  @Public()
  @Post('session/mobile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'createMobileChatSession',
    summary: 'Create a mobile chat session',
  })
  @ApiOkResponse({ description: 'Session created' })
  @ApiForbiddenResponse({ description: 'Origin not allowed' })
  @ApiTooManyRequestsResponse({ description: 'Rate limited' })
  async createMobileSession(@Req() req: Request) {
    this.assertOrigin(req);
    this.assertCreateRate(req);

    const result = await this.startSession.execute({ clientType: 'mobile' });
    return {
      sessionId: result.sessionId,
      sessionToken: result.token,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    };
  }

  @Public()
  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ChatSessionGuard)
  @ApiOperation({
    operationId: 'refreshMobileToken',
    summary: 'Refresh a mobile access token',
  })
  @ApiOkResponse({ description: 'New access token issued' })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  async refresh(@Req() req: ChatRequest) {
    return this.refreshToken.execute(req.chatSession!);
  }

  @Public()
  @Get('messages')
  @UseGuards(ChatSessionGuard)
  @ApiOperation({
    operationId: 'getChatMessages',
    summary: 'Replay messages (REST fallback)',
  })
  @ApiQuery({ name: 'after_seq', required: false, type: Number })
  @ApiOkResponse({ description: 'Messages returned' })
  @ApiUnauthorizedResponse({ description: 'Session invalid or expired' })
  async messages(
    @Req() req: ChatRequest,
    @Query('after_seq') afterSeq?: string,
  ) {
    const seq = afterSeq === undefined ? 0 : Number(afterSeq);
    if (!Number.isInteger(seq) || seq < 0) {
      throw validationFailed('after_seq must be a non-negative integer.');
    }
    return this.listMessages.execute(req.chatSession!, seq);
  }

  private assertOrigin(req: Request): void {
    const origin = req.headers.origin;
    if (origin && !this.config.corsOrigins.includes(origin)) {
      throw originNotAllowed();
    }
  }

  private assertCreateRate(req: Request): void {
    if (!this.limiter.allow(`create:${this.clientIp(req)}`, 10)) {
      throw rateLimited(60_000);
    }
  }

  private clientIp(req: Request): string {
    if (this.config.trustProxy) {
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
      }
    }
    return req.ip || 'unknown';
  }
}
