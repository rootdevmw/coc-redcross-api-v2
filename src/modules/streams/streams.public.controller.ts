import { Controller, Get, Param, Query } from '@nestjs/common';
import { StreamsService } from './streams.service';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('public/streams')
export class PublicStreamsController {
  constructor(private service: StreamsService) {}

  @Get('platforms')
  @Public()
  getPlatforms() {
    return this.service.getPlatforms();
  }

  @Get()
  @Public()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  //  STATIC ROUTES FIRST
  @Get('live')
  @Public()
  findLive() {
    return this.service.findLive();
  }

  // -------------------------
  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
