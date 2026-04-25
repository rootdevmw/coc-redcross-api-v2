import { Module } from '@nestjs/common';
import { AttentionService } from './attention.service';
import { AttentionController } from './attention.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { PublicAttentionController } from './attention.public.controller';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';

@Module({
  controllers: [AttentionController, PublicAttentionController],
  providers: [
    AttentionService,
    PrismaService,
    AuditService,
    RequestContextService,
  ],
})
export class AttentionModule {}
