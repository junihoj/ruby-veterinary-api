import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  Public,
  CurrentUser,
  type AuthUser,
} from '../../../shared/cross-cutting/decorators';
import { IdentityFacadePort } from '../application/facades/identity-facade-port';
import { RegisterUserCommand } from '../application/commands/register-user.command';
import { LoginUserCommand } from '../application/commands/login-user.command';
import { RefreshTokensCommand } from '../application/commands/refresh-tokens.command';
import { LogoutUserCommand } from '../application/commands/logout-user.command';
import { GetCurrentUserQuery } from '../application/queries/get-current-user.query';
import { RegisterRequestDto } from '../application/dto/register-request.dto';
import { LoginRequestDto } from '../application/dto/login-request.dto';
import { RefreshRequestDto } from '../application/dto/refresh-request.dto';
import {
  AuthTokensDto,
  AuthUserDto,
} from '../application/dto/auth-response.dto';

/** Contract rate limit for auth endpoints: 10 per 10 min per IP. */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 600_000 } } as const;

/**
 * Auth API (auth.yaml). Public routes opt out with @Public; /me and /logout
 * are protected by the default-deny AuthGuard. Every response is marked
 * no-store (api-specification.md cache policy) and every route inherits the
 * 10-per-10-min auth rate limit; register/login document 429 per auth.yaml.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly identity: IdentityFacadePort) {}

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'registerClient',
    summary: 'Register a client account',
  })
  @ApiCreatedResponse({ description: 'Account created' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED' })
  @ApiConflictResponse({ description: 'EMAIL_TAKEN' })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED' })
  async register(@Body() dto: RegisterRequestDto): Promise<AuthUserDto> {
    return this.identity.register(
      new RegisterUserCommand(
        dto.email,
        dto.password,
        dto.displayName,
        dto.phone,
      ),
    );
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'login',
    summary: 'Issue access and refresh tokens',
  })
  @ApiOkResponse({ description: 'Tokens issued' })
  @ApiUnauthorizedResponse({
    description: 'TOKEN_EXPIRED or INVALID_CREDENTIALS',
  })
  @ApiTooManyRequestsResponse({ description: 'RATE_LIMITED' })
  async login(
    @Body() dto: LoginRequestDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.identity.login(
      new LoginUserCommand(
        dto.email,
        dto.password,
        req.ip,
        req.headers['user-agent'],
        'web',
      ),
    );
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'refreshToken',
    summary: 'Rotate refresh token',
  })
  @ApiOkResponse({ description: 'New token pair' })
  @ApiUnauthorizedResponse({
    description: 'TOKEN_EXPIRED or INVALID_CREDENTIALS',
  })
  async refresh(
    @Body() dto: RefreshRequestDto,
    @Req() req: Request,
  ): Promise<AuthTokensDto> {
    return this.identity.refresh(
      new RefreshTokensCommand(
        dto.refreshToken,
        req.ip,
        req.headers['user-agent'],
        'web',
      ),
    );
  }

  @Throttle(AUTH_THROTTLE)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'logout', summary: 'Revoke refresh token' })
  @ApiNoContentResponse({ description: 'Revoked' })
  @ApiUnauthorizedResponse({
    description: 'TOKEN_EXPIRED or INVALID_CREDENTIALS',
  })
  async logout(@Body() dto: RefreshRequestDto): Promise<void> {
    await this.identity.logout(new LogoutUserCommand(dto.refreshToken));
  }

  @Throttle(AUTH_THROTTLE)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getCurrentUser',
    summary: 'Current identity and roles',
  })
  @ApiOkResponse({ description: 'Identity' })
  @ApiUnauthorizedResponse({
    description: 'TOKEN_EXPIRED or INVALID_CREDENTIALS',
  })
  async me(@CurrentUser() user: AuthUser): Promise<AuthUserDto> {
    return this.identity.getCurrentUser(new GetCurrentUserQuery(user.id));
  }
}
