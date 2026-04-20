import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from 'src/generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { softDeleteExtension } from './extensions/soft-delete.extension';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl)
      throw new Error('DATABASE_URL environment variable is not set');

    const url = new URL(rawUrl);
    const adapter = new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
    });

    super({
      adapter,
      log: ['info'],
    });

    return this.$extends(softDeleteExtension(this)) as this;
  }

  async onModuleInit() {
    this.logger.log('Connecting to database');
    await this.$connect();
    this.logger.log('Database connection established');
  }
}
