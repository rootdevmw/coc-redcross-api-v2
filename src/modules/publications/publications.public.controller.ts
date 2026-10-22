import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { PublicationService } from './publications.service';
import type { PublicLibraryQuery } from '../../common/utils/public-library';

@Controller('public/publications')
export class PublicPublicationsController {
  constructor(private service: PublicationService) {}

  @Get()
  @Public()
  findAll(@Query() query: PublicLibraryQuery = {}) {
    return this.service.findPublic(query);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.service.readPublic(id);
  }
}
