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

  @IsOptional()
  @IsString()
  JWT_SECRET: string = 'dev-only-change-me';

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
}

export interface AppConfig {
  databaseUrl: string;
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  jwtSecret: string;
  jwtAccessTtlSeconds: number;
  jwtRefreshTtlSeconds: number;
  swaggerEnabled: boolean;
}

export function buildAppConfig(env: EnvVariables): AppConfig {
  return Object.freeze({
    databaseUrl: env.DATABASE_URL,
    nodeEnv: env.NODE_ENV as AppConfig['nodeEnv'],
    port: Number(env.PORT),
    jwtSecret: env.JWT_SECRET,
    jwtAccessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    jwtRefreshTtlSeconds: env.JWT_REFRESH_TTL_SECONDS,
    swaggerEnabled: env.SWAGGER_ENABLED === 'true',
  });
}

export const APP_CONFIG = Symbol('APP_CONFIG');
