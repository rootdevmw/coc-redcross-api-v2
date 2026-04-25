import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Delete,
  Req,
} from '@nestjs/common';
import { HomecellsService } from './homecells.service';
import { CreateHomecellDto } from './dto/create-homecell.dto';
import { UpdateHomecellDto } from './dto/update-homecell.dto';
import { AssignMemberDto } from './dto/assign-member.dto';

@Controller('homecells')
export class HomecellsController {
  constructor(private service: HomecellsService) {}

  @Post()
  create(@Body() dto: CreateHomecellDto, @Req() req: any) {
    return this.service.create(dto, req.user);
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
  update(@Param('id') id: string, @Body() dto: UpdateHomecellDto, @Req() req: any) {
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
  assignMember(@Param('id') homecellId: string, @Body() dto: AssignMemberDto, @Req() req: any) {
    return this.service.assignMember(homecellId, dto.memberId, req.user);
  }

  @Delete(':id/members/:memberId')
  removeMember(@Param('id') homecellId: string, @Param('memberId') memberId: string, @Req() req: any) {
    return this.service.removeMember(homecellId, memberId, req.user);
  }
}
