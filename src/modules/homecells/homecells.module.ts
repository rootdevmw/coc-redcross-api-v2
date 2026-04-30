import { Module } from '@nestjs/common';
import { HomecellsService } from './homecells.service';
import { HomecellsController } from './homecells.controller';
import { PublicHomecellsController } from './homecells.public.controller';
import { AuditService } from '../audit/audit.service';
import { RequestContextService } from '../audit/request-contenxt.service';
import { SlugService } from 'src/common/utils/slugify';

@Module({
  controllers: [HomecellsController, PublicHomecellsController],
  providers: [
    HomecellsService,
    AuditService,
    RequestContextService,
    SlugService,
  ],
})
export class HomecellsModule {}
