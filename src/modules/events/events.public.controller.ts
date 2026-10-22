import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { EventsService } from './events.service';
import type { PublicEventQuery } from '../../common/utils/public-events';

@Controller('public/events')
export class PublicEventsController {
  constructor(private service: EventsService) {}

  @Get('types')
  @Public()
  getTypes() {
    return this.service.getPublicTypes();
  }

  @Get()
  @Public()
  findAll(@Query() query: PublicEventQuery = {}) {
    return this.service.findPublic(query);
  }

  @Get(':slug')
  @Public()
  findOne(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }
}
