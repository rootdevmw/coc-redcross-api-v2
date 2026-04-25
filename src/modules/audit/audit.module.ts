import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';


@Module({
  controllers: [],
  providers: [AuditService],
})
export class AuditModule {}
