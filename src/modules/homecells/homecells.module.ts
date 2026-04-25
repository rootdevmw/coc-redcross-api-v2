import { Module } from '@nestjs/common';
import { HomecellsService } from './homecells.service';
import { HomecellsController } from './homecells.controller';
import { PublicHomecellsController } from './homecells.public.controller';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';

@Module({
  controllers: [HomecellsController, PublicHomecellsController],
  providers: [HomecellsService, AuditService, RequestContextService],
})
export class HomecellsModule {}
