import { Global, Module } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  APP_CONFIG,
  AppConfig,
  EnvVariables,
  buildAppConfig,
} from './config.types';

function validateEnv(): AppConfig {
  const env = plainToInstance(EnvVariables, process.env, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join('; '))
      .join('\n  ');
    throw new Error(`Invalid environment configuration:\n  ${messages}`);
  }
  return buildAppConfig(env);
}

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: validateEnv }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
