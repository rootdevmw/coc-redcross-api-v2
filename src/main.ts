import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { join } from 'path';
import cookieParser from 'cookie-parser';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { BigIntInterceptor } from './common/interceptors/bigint.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));
  app.useGlobalInterceptors(new BigIntInterceptor());
  const config = app.get(ConfigService);
  app.enableCors({
    origin: config.get('CORS_ORIGIN'),
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
