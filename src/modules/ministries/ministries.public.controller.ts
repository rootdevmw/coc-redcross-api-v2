import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { QueryMinistryDto } from './dto/query-ministry.dto';
import { MinistriesService } from './ministries.service';

@Controller('public/ministries')
export class PublicMinistriesController {
  constructor(private service: MinistriesService) {}

  @Get()
  @Public()
  findAll(@Query() query: QueryMinistryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/members')
  @Public()
  getMembers(@Param('id') id: string) {
    return this.service.getMembers(id);
  }
}
