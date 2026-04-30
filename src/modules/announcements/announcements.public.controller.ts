import { Controller, Get, Query, Param } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { QueryAnnouncementDto } from './dto/query-announcement.dto';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('public/announcements')
export class PublicAnnouncementsController {
  constructor(private service: AnnouncementsService) {}

  @Get()
  @Public()
  findAll(@Query() query: QueryAnnouncementDto) {
    return this.service.findAll(query);
  }

  @Get('member/:memberId')
  @Public()
  findForMember(@Param('memberId') memberId: string) {
    return this.service.findForMember(memberId);
  }

  @Get(':slug')
  @Public()
  findOne(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }
}
