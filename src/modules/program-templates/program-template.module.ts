import { Module } from '@nestjs/common';
import { ProgramTemplatesController } from './program-template.controller';
import { ProgramTemplatesService } from './program-template.service';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';

@Module({
  controllers: [ProgramTemplatesController],
  providers: [ProgramTemplatesService, AuditService, RequestContextService],
})
export class ProgramTemplatesModule {}
