import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { PublicationService } from './publications.service';

@Controller('public/publications')
export class PublicPublicationsController {
  constructor(private service: PublicationService) {}

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
