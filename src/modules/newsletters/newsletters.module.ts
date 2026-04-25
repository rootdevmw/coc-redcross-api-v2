import { Module } from '@nestjs/common';
import { NewslettersController } from './newsletters.controller';
import { PublicNewslettersController } from './newsletters.public.controller';
import { NewslettersService } from './newsletters.service';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';

@Module({
  controllers: [NewslettersController, PublicNewslettersController],
  providers: [NewslettersService, AuditService, RequestContextService],
})
export class NewslettersModule {}
