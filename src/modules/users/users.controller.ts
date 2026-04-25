import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  Post,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';
import { SessionAuthGuard } from '../auth/guard/session.guard';

@Controller('users')
@UseGuards(SessionAuthGuard, RolesGuard)
export class UsersController {
  constructor(private service: UsersService) {}

  // -----------------------------
  // LINK USER → MEMBER
  // -----------------------------
  @Post(':id/member')
  @Roles('ADMIN')
  linkMember(@Param('id') userId: string, @Body('memberId') memberId: string, @Req() req: any) {
    return this.service.linkMember(userId, memberId, req.user);
  }

  // -----------------------------
  // UNLINK USER → MEMBER
  // -----------------------------
  @Delete(':id/member')
  @Roles('ADMIN')
  unlinkMember(@Param('id') userId: string, @Req() req: any) {
    return this.service.unlinkMember(userId, req.user);
  }

  //  Only ADMIN can manage users
  @Post()
  @Roles('ADMIN')
  create(@Body() dto: any, @Req() req: any) {
    return this.service.create(dto, req.user);
  }
  @Get()
  @Roles('ADMIN')
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user);
  }
}
