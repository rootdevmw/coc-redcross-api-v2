import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from 'src/generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);

    super({
      adapter,
      log: ['info'],
    });
  }

  async onModuleInit() {
    this.logger.log('Connecting to database');
    await this.$connect();
    this.logger.log('Database connection established');
  }
}
