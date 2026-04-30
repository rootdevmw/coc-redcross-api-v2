import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { EventsService } from './events.service';

@Controller('public/events')
export class PublicEventsController {
  constructor(private service: EventsService) {}

  @Get('types')
  @Public()
  getTypes() {
    return this.service.getTypes();
  }

  @Get()
  @Public()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':slug')
  @Public()
  findOne(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }
}
