import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { QueryMinistryDto } from './dto/query-ministry.dto';
import { MinistriesService } from './ministries.service';

@Controller('public/ministries')
export class PublicMinistriesController {
  constructor(private service: MinistriesService) {}

  @Get()
  @Public()
  findAll(@Query() query: QueryMinistryDto) {
    return this.service.findAll(query);
  }

  @Get(':slug')
  @Public()
  findOne(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }
}
