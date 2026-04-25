import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditReaderService } from './audit.reader.service';
import { AuditController } from './audit.reader.controller';
import { RequestContextService } from './request-contenxt.service';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditReaderService, RequestContextService],
  exports: [AuditService, AuditReaderService, RequestContextService],
})
export class AuditModule {}
