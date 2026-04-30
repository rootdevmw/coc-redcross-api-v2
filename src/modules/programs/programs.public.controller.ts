import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('public/programs')
export class PublicProgramsController {
  constructor(private service: ProgramsService) {}

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
