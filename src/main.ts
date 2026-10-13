import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './shared/cross-cutting/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Rule 5.1 — versioned base path.
  app.setGlobalPrefix('api/v1');

  // §9 — DTO validation at the HTTP boundary.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // §9 — error envelope.
  app.useGlobalFilters(new ApiExceptionFilter());

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`ruby-veterinary-api listening on :${port}/api/v1`);
}
bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap', err);
  process.exit(1);
});
