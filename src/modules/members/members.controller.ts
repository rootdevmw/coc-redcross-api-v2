import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Delete,
} from '@nestjs/common';
import { MembersService } from './members.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMemberDto } from './dto/query-member.dto';

@Controller('members')
export class MembersController {
  constructor(private service: MembersService) {}

  @Post()
  create(@Body() dto: CreateMemberDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryMemberDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/ministries')
  assignMinistry(
    @Param('id') memberId: string,
    @Body('ministryId') ministryId: string,
  ) {
    return this.service.assignMinistry(memberId, ministryId);
  }

  @Delete(':id/ministries/:ministryId')
  removeMinistry(
    @Param('id') memberId: string,
    @Param('ministryId') ministryId: string,
  ) {
    return this.service.removeMinistry(memberId, ministryId);
  }
}
