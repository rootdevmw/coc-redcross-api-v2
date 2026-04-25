import { Module } from '@nestjs/common';
import { MinistriesService } from './ministries.service';
import { MinistriesController } from './ministries.controller';
import { PublicMinistriesController } from './ministries.public.controller';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';

@Module({
  controllers: [MinistriesController, PublicMinistriesController],
  providers: [MinistriesService, AuditService, RequestContextService],
})
export class MinistriesModule {}
