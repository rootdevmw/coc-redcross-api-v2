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
} from '@nestjs/common';
import { MinistriesService } from './ministries.service';
import { CreateMinistryDto } from './dto/create-ministry.dto';
import { UpdateMinistryDto } from './dto/update-ministry.dto';
import { QueryMinistryDto } from './dto/query-ministry.dto';

@Controller('ministries')
export class MinistriesController {
  constructor(private service: MinistriesService) {}

  @Post()
  create(@Body() dto: CreateMinistryDto, @Req() req: any) {
    return this.service.create(dto, req.user);
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
  update(@Param('id') id: string, @Body() dto: UpdateMinistryDto, @Req() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.service.getMembers(id);
  }

  @Post(':id/members')
  assignMember(
    @Param('id') ministryId: string,
    @Body('memberId') memberId: string,
    @Req() req: any,
  ) {
    return this.service.assignMember(memberId, ministryId, req.user);
  }

  @Delete(':id/members/:memberId')
  removeMember(
    @Param('id') ministryId: string,
    @Param('memberId') memberId: string,
    @Req() req: any,
  ) {
    return this.service.removeMember(memberId, ministryId, req.user);
  }
}
