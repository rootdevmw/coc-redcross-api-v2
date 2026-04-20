import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsController } from './announcements.controller';
import { PublicAnnouncementsController } from './announcements.public.controller';

@Module({
  controllers: [AnnouncementsController, PublicAnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
