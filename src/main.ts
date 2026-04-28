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
  app.enableCors({
    origin: config.get('CORS_ORIGIN'),
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
