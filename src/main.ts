import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { join } from 'path';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { BigIntInterceptor } from './common/interceptors/bigint.interceptor';
import { ResponseWrapperInterceptor } from './common/interceptors/response-wrapper.interceptor';
import { GlobalExceptionFilter } from './common/filters/exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  app.useGlobalInterceptors(new BigIntInterceptor());
  app.useGlobalInterceptors(new ResponseWrapperInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  const config = app.get(ConfigService);

  const raw = config.get<string>('CORS_ORIGIN');
  if (!raw) throw new Error('CORS_ORIGIN env variable is not set');
  const allowedOrigins = raw.split(',').map((o) => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      // Exact match
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Wildcard subdomain support e.g. *.example.com
      const isAllowed = allowedOrigins.some((allowed) => {
        if (allowed.startsWith('*.')) {
          const domain = allowed.slice(2);
          return origin.endsWith(`.${domain}`) || origin === domain;
        }
        return false;
      });

      if (isAllowed) return callback(null, true);

      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
