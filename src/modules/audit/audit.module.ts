import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditReaderService } from './audit.reader.service';
import { AuditController } from './audit.reader.controller';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditReaderService],
  exports: [AuditService, AuditReaderService],
})
export class AuditModule {}
