import { Module } from '@nestjs/common';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { PublicContentController } from './content.public.controller';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';
import { SlugService } from 'src/common/utils/slugify';

@Module({
  controllers: [ContentController, PublicContentController],
  providers: [ContentService, AuditService, RequestContextService, SlugService],
})
export class ContentModule {}
