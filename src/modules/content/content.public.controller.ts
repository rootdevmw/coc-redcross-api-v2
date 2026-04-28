import { Controller, Get, Param, Query } from '@nestjs/common';
import { ContentService } from './content.service';

import { QueryContentDto } from './dto/query-content.dto';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('public/content')
export class PublicContentController {
  constructor(private service: ContentService) {}

  @Get()
  @Public()
  findAll(@Query() query: QueryContentDto) {
    return this.service.findAll(query);
  }

  @Get('types')
  @Public()
  getTypes() {
    return this.service.getTypes();
  }
  @Get(':slug')
  @Public()
  findOne(@Param('slug') slug: string) {
    return this.service.findOneBySlug(slug);
  }
}
