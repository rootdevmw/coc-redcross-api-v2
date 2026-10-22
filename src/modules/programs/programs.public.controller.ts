import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { Public } from 'src/common/decorators/public.decorator';
import type { PublicProgramQuery } from '../../common/utils/public-programs';

@Controller('public/programs')
export class PublicProgramsController {
  constructor(private service: ProgramsService) {}

  @Get('types')
  @Public()
  getTypes() {
    return this.service.getPublicTypes();
  }

  @Get()
  @Public()
  findAll(@Query() query: PublicProgramQuery = {}) {
    return this.service.findPublic(query);
  }

  @Get(':slug')
  @Public()
  findOne(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }
}
