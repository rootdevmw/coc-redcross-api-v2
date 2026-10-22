import { Controller, Get, Param } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { MembersService } from './members.service';

@Controller('public/members')
export class PublicMembersController {
  constructor(private service: MembersService) {}

  @Get('pastors')
  @Public()
  findPastors() {
    return this.service.findPastors();
  }

  @Get('elders')
  @Public()
  findElders() {
    return this.service.findElders();
  }

  @Get(':prefix')
  @Public()
  findByPrefix(@Param('prefix') prefix: string) {
    return this.service.findByPrefix(prefix);
  }
}
