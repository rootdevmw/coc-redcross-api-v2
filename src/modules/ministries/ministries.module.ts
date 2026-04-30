import { Module } from '@nestjs/common';
import { MinistriesService } from './ministries.service';
import { MinistriesController } from './ministries.controller';
import { PublicMinistriesController } from './ministries.public.controller';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';
import { SlugService } from 'src/common/utils/slugify';

@Module({
  controllers: [MinistriesController, PublicMinistriesController],
  providers: [MinistriesService, AuditService, RequestContextService, SlugService],
})
export class MinistriesModule {}
