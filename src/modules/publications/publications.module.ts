import { Module } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';
import { PublicationsController } from './publications.controller';
import { PublicPublicationsController } from './publications.public.controller';
import { PublicationService } from './publications.service';

@Module({
  controllers: [PublicPublicationsController, PublicationsController],
  providers: [PublicationService, AuditService, RequestContextService],
})
export class PublicationsModule {}
