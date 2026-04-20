import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { NewslettersService } from './newsletters.service';

@Controller('public/newsletters')
export class PublicNewslettersController {
  constructor(private service: NewslettersService) {}

  @Get()
  @Public()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
