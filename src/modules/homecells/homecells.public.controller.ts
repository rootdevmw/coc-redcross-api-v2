import { Controller, Get, Param } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { HomecellsService } from './homecells.service';

@Controller('public/homecells')
export class PublicHomecellsController {
  constructor(private service: HomecellsService) {}

  @Get()
  @Public()
  findAll() {
    return this.service.findAll();
  }

  @Get(':slug')
  @Public()
  findOne(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  @Get(':id/members')
  @Public()
  getMembers(@Param('id') id: string) {
    return this.service.getMembers(id);
  }
}
