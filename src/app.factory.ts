import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { APP_CONFIG, AppConfig } from './config/config.types';
import { ApiExceptionFilter } from './shared/cross-cutting/api-exception.filter';
import { EnvelopeInterceptor } from './shared/cross-cutting/envelope.interceptor';

/**
 * Builds the fully-wired application (§9). Shared by main.ts, the OpenAPI
 * export, and the e2e suite so every consumer exercises the exact production
 * pipeline: prefix, CORS, validation, envelope, exception filter, throttler,
 * and both global guards. Lives outside main.ts so importing it never runs
 * `bootstrap()` (no listener side effects during tests).
 */
export async function createApp() {
  const app = await NestFactory.create(AppModule);

  // Rule 5.1 — versioned base path.
  app.setGlobalPrefix('api/v1');

  // CORS — dev front end origins from config.
  const config = app.get<AppConfig>(APP_CONFIG);
  app.enableCors({ origin: config.corsOrigins });

  // §9 — DTO validation at the HTTP boundary.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // §9 — success envelope + error envelope.
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());

  // Swagger at /docs (gated by SWAGGER_ENABLED).
  if (config.swaggerEnabled) {
    const document = new DocumentBuilder()
      .setTitle('ruby-veterinary API')
      .setDescription(
        'Modular monolith API for the ruby-veterinary clinic platform.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, document);
    SwaggerModule.setup('docs', app, swaggerDocument);
  }

  // Register routes, guards, filters, and middleware on the HTTP adapter.
  // Required before handing the server to supertest; listen() re-running
  // init() is a no-op (guarded), so main.ts is unaffected.
  await app.init();

  return app;
}
