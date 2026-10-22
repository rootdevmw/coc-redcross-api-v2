import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import type { PublicGroupQuery } from '../../common/utils/public-groups';
import { MinistriesService } from './ministries.service';

@Controller('public/ministries')
export class PublicMinistriesController {
  constructor(private service: MinistriesService) {}

  @Get()
  @Public()
  findAll(@Query() query: PublicGroupQuery = {}) {
    return this.service.findPublic(query);
  }

  @Get(':slug')
  @Public()
  findOne(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }
}
