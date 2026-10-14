import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

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
}

export interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
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
  });
}

export const APP_CONFIG = Symbol('APP_CONFIG');
