import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsController } from './announcements.controller';
import { PublicAnnouncementsController } from './announcements.public.controller';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';

@Module({
  controllers: [AnnouncementsController, PublicAnnouncementsController],
  providers: [AnnouncementsService, AuditService, RequestContextService],
})
export class AnnouncementsModule {}
