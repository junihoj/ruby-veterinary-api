import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

/**
 * Exports the live Swagger document to dist/openapi.json (M2 gate:
 * "OpenAPI export diffed against openapi/"). Run: pnpm openapi:export.
 *
 * Deliberately does NOT apply the /api/v1 global prefix — the committed
 * contract files define paths relative to the server URL's /api/v1 base,
 * so the export must mirror that shape for the diff to be meaningful.
 */
async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  const document = new DocumentBuilder()
    .setTitle('ruby-veterinary API')
    .setDescription('Modular monolith API for the ruby-veterinary clinic platform.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, document);

  const outDir = join(__dirname, '..', 'dist');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'openapi.json');
  writeFileSync(outPath, JSON.stringify(swaggerDocument, null, 2));
  console.log(`OpenAPI exported to ${outPath}`);

  await app.close();
}

exportOpenApi().catch((err) => {
  console.error(err);
  process.exit(1);
});
