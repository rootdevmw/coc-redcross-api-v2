import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { HomecellsService } from './homecells.service';
import type { PublicGroupQuery } from '../../common/utils/public-groups';

@Controller('public/homecells')
export class PublicHomecellsController {
  constructor(private service: HomecellsService) {}

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

  @Get(':id/members')
  @Public()
  getMembers(@Param('id') id: string) {
    return this.service.getPublicMembers(id);
  }
}
