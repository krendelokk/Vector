import 'dotenv/config';
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as Sentry from '@sentry/node';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

function assertEnv() {
  const weak = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter(
    (k) => !process.env[k] || process.env[k]!.length < 32 || process.env[k]!.startsWith('change-me'),
  );
  if (weak.length && process.env.NODE_ENV === 'production') {
    throw new Error(`Задайте надійні значення для ${weak.join(', ')} (щонайменше 32 символи)`);
  }
  if (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET і JWT_REFRESH_SECRET обов\'язкові');
  }
}

async function bootstrap() {
  assertEnv();

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      // Жодних IP, заголовків, cookies і тіл запитів у звітах про помилки
      beforeSend(event) {
        delete event.user;
        if (event.request) {
          delete event.request.headers;
          delete event.request.cookies;
          delete event.request.data;
          delete event.request.query_string;
        }
        return event;
      },
    });
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: true });
  app.set('trust proxy', 1); // за nginx: req.ip береться з X-Forwarded-For
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API: http://localhost:${port}/api`);
}

void bootstrap();
