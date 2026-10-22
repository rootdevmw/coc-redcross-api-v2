import { Module } from '@nestjs/common';
import { AttentionService } from './attention.service';
import { AttentionController } from './attention.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { PublicAttentionController } from './attention.public.controller';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';
import { EmailService } from '../email/email.service';
import { AttentionQueueService } from './attention.queue.service';
import { PrayerTeamService } from './prayer-team.service';

@Module({
  controllers: [AttentionController, PublicAttentionController],
  providers: [
    AttentionService,
    AttentionQueueService,
    PrayerTeamService,
    PrismaService,
    AuditService,
    RequestContextService,
    EmailService,
  ],
})
export class AttentionModule {}
