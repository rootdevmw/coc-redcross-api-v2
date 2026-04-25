import { Controller, Get, Query, Param } from '@nestjs/common';
import { AuditReaderService } from './audit.reader.service';

@Controller('audit')
export class AuditController {
  constructor(private auditReader: AuditReaderService) {}

  // ENTITY LIST
  @Get(':entity')
  findByEntity(@Param('entity') entity: string, @Query() query: any) {
    return this.auditReader.findByEntity({
      entity,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 10,
      action: query.action,
      search: query.search,
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
