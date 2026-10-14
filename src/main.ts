import { APP_CONFIG, AppConfig } from './config/config.types';
import { createApp } from './app.factory';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.port);
  console.log(`ruby-veterinary-api listening on :${config.port}/api/v1`);
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap', err);
  process.exit(1);
});
