import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { PublicEventsController } from './events.public.controller';
import { AuditService } from '../audit/audit.service';

@Module({
  controllers: [EventsController, PublicEventsController],
  providers: [EventsService, AuditService],
})
export class EventsModule {}
