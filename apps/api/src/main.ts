import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.ts';
import { DyceErrorFilter } from './common/dyce-error.filter.ts';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Behind a load balancer the client IP comes from X-Forwarded-For; trust only the hops we run.
  const hops = config.getOrThrow<number>('TRUST_PROXY_HOPS');
  if (hops > 0) app.set('trust proxy', hops);

  // Native apps don't need CORS; browsers (web guest game, local web dev) only get the origins we list.
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.length > 0)
    app.enableCors({
      origin: origins,
      methods: ['GET', 'POST', 'DELETE', 'PATCH', 'PUT'],
      maxAge: 600,
    });

  app.useGlobalFilters(new DyceErrorFilter());
  app.enableShutdownHooks();
  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  console.log(`dyce-api listening on :${port}`);
}

void bootstrap();
