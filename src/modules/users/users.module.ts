import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { EmailModule } from '../email/email.module';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PrismaService, AuditService, RequestContextService],
  imports: [EmailModule],
})
export class UsersModule {}
