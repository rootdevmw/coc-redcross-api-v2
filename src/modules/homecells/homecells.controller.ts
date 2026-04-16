import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Delete,
} from '@nestjs/common';
import { HomecellsService } from './homecells.service';
import { CreateHomecellDto } from './dto/create-homecell.dto';
import { UpdateHomecellDto } from './dto/update-homecell.dto';
import { AssignMemberDto } from './dto/assign-member.dto';

@Controller('homecells')
export class HomecellsController {
  constructor(private service: HomecellsService) {}

  @Post()
  create(@Body() dto: CreateHomecellDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateHomecellDto) {
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
  assignMember(@Param('id') homecellId: string, @Body() dto: AssignMemberDto) {
    return this.service.assignMember(homecellId, dto.memberId);
  }

  @Delete(':id/members/:memberId')
  removeMember(@Param('id') homecellId: string, @Param('memberId') memberId: string) {
    return this.service.removeMember(homecellId, memberId);
  }
}
