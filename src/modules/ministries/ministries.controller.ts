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
import { MinistriesService } from './ministries.service';
import { CreateMinistryDto } from './dto/create-ministry.dto';
import { UpdateMinistryDto } from './dto/update-ministry.dto';
import { QueryMinistryDto } from './dto/query-ministry.dto';

@Controller('ministries')
export class MinistriesController {
  constructor(private service: MinistriesService) {}

  @Post()
  create(@Body() dto: CreateMinistryDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryMinistryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMinistryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.service.getMembers(id);
  }

  @Post(':id/members')
  assignMember(
    @Param('id') ministryId: string,
    @Body('memberId') memberId: string,
  ) {
    return this.service.assignMember(memberId, ministryId);
  }

  @Delete(':id/members/:memberId')
  removeMember(
    @Param('id') ministryId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.service.removeMember(memberId, ministryId);
  }
}
