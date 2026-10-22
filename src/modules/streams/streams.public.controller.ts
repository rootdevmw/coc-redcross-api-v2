import { Controller, Get, Param, Query } from '@nestjs/common';
import { StreamsService } from './streams.service';
import { Public } from 'src/common/decorators/public.decorator';
import type { PublicLibraryQuery } from '../../common/utils/public-library';

@Controller('public/streams')
export class PublicStreamsController {
  constructor(private service: StreamsService) {}

  @Get('platforms')
  @Public()
  getPlatforms() {
    return this.service.getPublicPlatforms();
  }

  @Get()
  @Public()
  findAll(@Query() query: PublicLibraryQuery = {}) {
    return this.service.findPublic(query);
  }

  //  STATIC ROUTES FIRST
  @Get('live')
  @Public()
  findLive() {
    return this.service.findPublicLive();
  }

  // -------------------------
  @Get(':slug')
  @Public()
  findOne(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }
}
