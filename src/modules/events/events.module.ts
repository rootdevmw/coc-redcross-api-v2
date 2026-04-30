import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { PublicEventsController } from './events.public.controller';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';
import { SlugService } from 'src/common/utils/slugify';

@Module({
  controllers: [EventsController, PublicEventsController],
  providers: [EventsService, AuditService, RequestContextService, SlugService],
})
export class EventsModule {}
