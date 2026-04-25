import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorator/roles.decorator';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMemberDto } from './dto/query-member.dto';
import { SessionAuthGuard } from '../auth/guard/session.guard';

@Controller('members')
@Roles('DEACON')
export class MembersController {
  constructor(private service: MembersService) {}

  @Post()
  create(@Body() dto: CreateMemberDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  @UseGuards(SessionAuthGuard)
  @Get()
  findAll(@Query() query: QueryMemberDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMemberDto, @Req() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user);
  }

  @Post(':id/ministries')
  assignMinistry(
    @Param('id') memberId: string,
    @Body('ministryId') ministryId: string,
    @Req() req: any,
  ) {
    return this.service.assignMinistry(memberId, ministryId, req.user);
  }

  @Delete(':id/ministries/:ministryId')
  removeMinistry(
    @Param('id') memberId: string,
    @Param('ministryId') ministryId: string,
    @Req() req: any,
  ) {
    return this.service.removeMinistry(memberId, ministryId, req.user);
  }
}
