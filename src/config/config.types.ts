import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

/**
 * Validated environment schema (§9). No hardcoded secrets or URLs; every value
 * is checked at boot and exposed as a frozen, typed object.
 */
export class EnvVariables {
  @IsString()
  DATABASE_URL: string;

  @IsOptional()
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @IsOptional()
  @IsString()
  PORT: string = '3000';

  // ADR-0011 — separate signing secrets for access and refresh tokens.
  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsOptional()
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL_SECONDS: number = 900; // 15 min

  @IsOptional()
  @IsInt()
  @Min(60)
  JWT_REFRESH_TTL_SECONDS: number = 60 * 60 * 24 * 30; // 30 days

  @IsOptional()
  @IsIn(['true', 'false'])
  SWAGGER_ENABLED: string = 'true';

  // M4 — intake form alert destination (ADR-0013: console adapter prints
  // until an SMTP provider is chosen; this is the `to` the adapter uses).
  @IsOptional()
  @IsString()
  FORM_ALERT_EMAIL: string = 'frontdesk@ruby-veterinary.example.com';

  @IsOptional()
  @IsString()
  CORS_ORIGINS: string = 'http://localhost:3001,http://localhost:3000';

  // ADR-0016 — S3-compatible object storage (SeaweedFS in dev). Optional:
  // endpoints that do not use it boot fine; the storage adapter fails
  // closed with a clear error when called unconfigured.
  @IsOptional()
  @IsString()
  S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  S3_SECRET_KEY?: string;

  // Shared secret for inbound payment webhooks (X-Provider-Signature HMAC).
  // Optional like S3_*: the webhook endpoint fails closed (401) when unset.
  @IsOptional()
  @IsString()
  PAYMENT_WEBHOOK_SECRET?: string;

  // M3b — subscription auto-refill tick (ms). 0 disables the in-process
  // timer; the default runs it every minute in dev/prod. E2E forces 0 via
  // test/setup-env.ts so auto-orders never race assertions. Kept as a
  // string like other env-typed values (no implicit conversion at boot).
  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'SUBSCRIPTIONS_TICK_MS must be a non-negative integer.',
  })
  SUBSCRIPTIONS_TICK_MS: string = '60000';

  // -------------------------------------------------------------------------
  // M6a — hybrid messaging + RAG AI assistant (ADR-0017)
  // -------------------------------------------------------------------------

  // Dedicated least-privilege connection for the `ai_kb` schema. Optional so
  // the app boots without the AI feature configured (the module fails closed
  // with a clear "AI unavailable" reply rather than crashing the process).
  @IsOptional()
  @IsString()
  AI_KB_DATABASE_URL?: string;

  @IsOptional()
  @IsString()
  OPENAI_API_KEY?: string;

  @IsOptional()
  @IsString()
  LLM_PROVIDER: string = 'openai';

  @IsOptional()
  @IsString()
  LLM_CHAT_MODEL: string = 'gpt-4o-mini';

  @IsOptional()
  @IsString()
  LLM_EMBEDDING_MODEL: string = 'text-embedding-3-small';

  @IsOptional()
  @Matches(/^\d+$/, { message: 'LLM_TIMEOUT_MS must be an integer.' })
  LLM_TIMEOUT_MS: string = '20000';

  @IsOptional()
  @Matches(/^\d+$/, { message: 'RAG_TOP_K must be an integer.' })
  RAG_TOP_K: string = '5';

  @IsOptional()
  @Matches(/^\d+(\.\d+)?$/, { message: 'RAG_MIN_SCORE must be a number.' })
  RAG_MIN_SCORE: string = '0.35';

  @IsOptional()
  @IsIn(['true', 'false'])
  OCR_ENABLED: string = 'false';

  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'CHAT_SESSION_TTL_MINUTES must be an integer.',
  })
  CHAT_SESSION_TTL_MINUTES: string = '45';

  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'CHAT_HANDOFF_RETENTION_HOURS must be an integer.',
  })
  CHAT_HANDOFF_RETENTION_HOURS: string = '24';

  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'CHAT_MAX_MESSAGE_CHARS must be an integer.',
  })
  CHAT_MAX_MESSAGE_CHARS: string = '2000';

  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'CHAT_MAX_MESSAGES_PER_SESSION must be an integer.',
  })
  CHAT_MAX_MESSAGES_PER_SESSION: string = '60';

  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'CHAT_RATE_PER_IP_PER_MIN must be an integer.',
  })
  CHAT_RATE_PER_IP_PER_MIN: string = '20';

  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'CHAT_RATE_PER_SESSION_PER_MIN must be an integer.',
  })
  CHAT_RATE_PER_SESSION_PER_MIN: string = '10';

  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'CHAT_DAILY_REQUEST_CAP must be an integer.',
  })
  CHAT_DAILY_REQUEST_CAP: string = '2000';

  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'CHAT_DAILY_TOKEN_CAP must be an integer.',
  })
  CHAT_DAILY_TOKEN_CAP: string = '2000000';

  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'CHAT_SWEEPER_TICK_MS must be a non-negative integer.',
  })
  CHAT_SWEEPER_TICK_MS: string = '300000';

  @IsOptional()
  @Matches(/^\d+$/, {
    message: 'AI_INGESTION_TICK_MS must be a non-negative integer.',
  })
  AI_INGESTION_TICK_MS: string = '10000';

  @IsOptional()
  @IsString()
  CLINIC_PHONE: string = '+2348139640640';

  @IsOptional()
  @IsString()
  CLINIC_CONTACT_URL: string = 'https://ruby-veterinary.com';

  @IsOptional()
  @IsString()
  CLINIC_BOOKING_URL: string = 'https://calendly.com/ezeonyekachukwu97/30min';

  @IsOptional()
  @IsIn(['true', 'false'])
  TRUST_PROXY: string = 'false';

  // Telegram handoff (M6b). Empty until the provider is wired; the webhook
  // route fails closed (401) when the secret is unset.
  @IsOptional()
  @IsString()
  TELEGRAM_BOT_TOKEN?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_FORUM_GROUP_ID?: string;

  @IsOptional()
  @IsString()
  TELEGRAM_WEBHOOK_SECRET?: string;

  // Bot API origin. Defaults to the public Telegram API; tests point this at a
  // local mock server so the real adapter code path is exercised offline.
  @IsOptional()
  @IsString()
  TELEGRAM_API_BASE_URL?: string;

  // Optional Turnstile challenge; no-op when unset (api-specification §Rate).
  @IsOptional()
  @IsString()
  TURNSTILE_SECRET_KEY?: string;
}

export interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
}

export interface AiConfig {
  /** Dedicated least-privilege connection for `ai_kb` (no Prisma). */
  kbDatabaseUrl?: string;
  openAiApiKey?: string;
  llmProvider: string;
  chatModel: string;
  embeddingModel: string;
  llmTimeoutMs: number;
  ragTopK: number;
  ragMinScore: number;
  ocrEnabled: boolean;
  ingestionTickMs: number;
}

export interface ChatConfig {
  sessionTtlMinutes: number;
  handoffRetentionHours: number;
  maxMessageChars: number;
  maxMessagesPerSession: number;
  ratePerIpPerMin: number;
  ratePerSessionPerMin: number;
  dailyRequestCap: number;
  dailyTokenCap: number;
  sweeperTickMs: number;
}

export interface ClinicContactConfig {
  phone: string;
  contactUrl: string;
  bookingUrl: string;
}

export interface TelegramConfig {
  botToken: string;
  forumGroupId: string;
  webhookSecret: string;
  apiBaseUrl: string;
}

export interface AppConfig {
  databaseUrl: string;
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtlSeconds: number;
  jwtRefreshTtlSeconds: number;
  swaggerEnabled: boolean;
  corsOrigins: string[];
  s3?: S3Config;
  paymentWebhookSecret?: string;
  subscriptionsTickMs: number;
  formAlertEmail: string;
  ai: AiConfig;
  chat: ChatConfig;
  clinic: ClinicContactConfig;
  telegram?: TelegramConfig;
  trustProxy: boolean;
  turnstileSecret?: string;
}

export function buildAppConfig(env: EnvVariables): AppConfig {
  const s3 =
    env.S3_ENDPOINT && env.S3_ACCESS_KEY && env.S3_SECRET_KEY
      ? {
          endpoint: env.S3_ENDPOINT,
          accessKey: env.S3_ACCESS_KEY,
          secretKey: env.S3_SECRET_KEY,
        }
      : undefined;

  const telegram =
    env.TELEGRAM_BOT_TOKEN &&
    env.TELEGRAM_FORUM_GROUP_ID &&
    env.TELEGRAM_WEBHOOK_SECRET
      ? {
          botToken: env.TELEGRAM_BOT_TOKEN,
          forumGroupId: env.TELEGRAM_FORUM_GROUP_ID,
          webhookSecret: env.TELEGRAM_WEBHOOK_SECRET,
          apiBaseUrl:
            env.TELEGRAM_API_BASE_URL?.trim().replace(/\/+$/, '') ||
            'https://api.telegram.org',
        }
      : undefined;

  return Object.freeze({
    databaseUrl: env.DATABASE_URL,
    nodeEnv: env.NODE_ENV as AppConfig['nodeEnv'],
    port: Number(env.PORT),
    jwtAccessSecret: env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET,
    jwtAccessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    jwtRefreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
    swaggerEnabled: env.SWAGGER_ENABLED === 'true',
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    ...(s3 ? { s3 } : {}),
    ...(env.PAYMENT_WEBHOOK_SECRET
      ? { paymentWebhookSecret: env.PAYMENT_WEBHOOK_SECRET }
      : {}),
    subscriptionsTickMs: Number(env.SUBSCRIPTIONS_TICK_MS),
    formAlertEmail: env.FORM_ALERT_EMAIL,
    ai: {
      ...(env.AI_KB_DATABASE_URL
        ? { kbDatabaseUrl: env.AI_KB_DATABASE_URL }
        : {}),
      ...(env.OPENAI_API_KEY ? { openAiApiKey: env.OPENAI_API_KEY } : {}),
      llmProvider: env.LLM_PROVIDER,
      chatModel: env.LLM_CHAT_MODEL,
      embeddingModel: env.LLM_EMBEDDING_MODEL,
      llmTimeoutMs: Number(env.LLM_TIMEOUT_MS),
      ragTopK: Number(env.RAG_TOP_K),
      ragMinScore: Number(env.RAG_MIN_SCORE),
      ocrEnabled: env.OCR_ENABLED === 'true',
      ingestionTickMs: Number(env.AI_INGESTION_TICK_MS),
    },
    chat: {
      sessionTtlMinutes: Number(env.CHAT_SESSION_TTL_MINUTES),
      handoffRetentionHours: Number(env.CHAT_HANDOFF_RETENTION_HOURS),
      maxMessageChars: Number(env.CHAT_MAX_MESSAGE_CHARS),
      maxMessagesPerSession: Number(env.CHAT_MAX_MESSAGES_PER_SESSION),
      ratePerIpPerMin: Number(env.CHAT_RATE_PER_IP_PER_MIN),
      ratePerSessionPerMin: Number(env.CHAT_RATE_PER_SESSION_PER_MIN),
      dailyRequestCap: Number(env.CHAT_DAILY_REQUEST_CAP),
      dailyTokenCap: Number(env.CHAT_DAILY_TOKEN_CAP),
      sweeperTickMs: Number(env.CHAT_SWEEPER_TICK_MS),
    },
    clinic: {
      phone: env.CLINIC_PHONE,
      contactUrl: env.CLINIC_CONTACT_URL,
      bookingUrl: env.CLINIC_BOOKING_URL,
    },
    ...(telegram ? { telegram } : {}),
    trustProxy: env.TRUST_PROXY === 'true',
    ...(env.TURNSTILE_SECRET_KEY
      ? { turnstileSecret: env.TURNSTILE_SECRET_KEY }
      : {}),
  });
}

export const APP_CONFIG = Symbol('APP_CONFIG');
