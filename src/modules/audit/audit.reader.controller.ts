import { Controller, Get, Query, Param } from '@nestjs/common';
import { Roles } from '../auth/decorator/roles.decorator';
import { AuditReaderService } from './audit.reader.service';

@Controller('audit')
@Roles('ADMIN')
export class AuditController {
  constructor(private auditReader: AuditReaderService) {}

  // ENTITY LIST
  @Get(':entity')
  findByEntity(@Param('entity') entity: string, @Query() query: any) {
    return this.auditReader.findByEntity({
      entity,
      page: query.page,
      limit: query.limit,
      action: query.action,
      search: query.search,
      actionSearch: query.actionSearch,
      actorId: query.actorId,
      from: query.from,
      to: query.to,
    });
  }

  // TIMELINE
  @Get(':entity/:id')
  findTimeline(@Param('entity') entity: string, @Param('id') id: string) {
    return this.auditReader.findEntityTimeline({
      entity,
      entityId: id,
    });
  }
}
