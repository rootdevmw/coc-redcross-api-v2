import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';
import { SessionAuthGuard } from '../auth/guard/session.guard';

@Controller('roles')
@Roles('ROOT')
@UseGuards(SessionAuthGuard, RolesGuard)
export class RolesController {
  constructor(private service: RolesService) {}

  @Post()
  @Roles('ROOT')
  create(@Body() dto: any, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  @Get()
  @Roles('ROOT')
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @Roles('ROOT')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles('ROOT')
  update(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('ROOT')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user);
  }
}
