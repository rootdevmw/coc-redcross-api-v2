import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { EmailModule } from '../email/email.module';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PrismaService],
  imports: [EmailModule],
})
export class UsersModule {}
