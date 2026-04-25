import { Module } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { ProgramsController } from './programs.controller';
import { PublicProgramsController } from './programs.public.controller';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';

@Module({
  controllers: [ProgramsController, PublicProgramsController],
  providers: [ProgramsService, AuditService, RequestContextService],
})
export class ProgramsModule {}
