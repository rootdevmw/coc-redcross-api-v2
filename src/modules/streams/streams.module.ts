import { Module } from '@nestjs/common';
import { StreamsService } from './streams.service';
import { StreamsController } from './streams.controller';
import { PublicStreamsController } from './streams.public.controller';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';
import { SlugService } from 'src/common/utils/slugify';

@Module({
  controllers: [StreamsController, PublicStreamsController],
  providers: [StreamsService, AuditService, RequestContextService, SlugService],
})
export class StreamsModule {}
