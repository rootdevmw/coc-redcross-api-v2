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
import { Roles } from '../auth/decorator/roles.decorator';
import { EventsService } from './events.service';

@Controller('events')
@Roles('DEACON')
export class EventsController {
  constructor(private service: EventsService) {}

  // STATIC ROUTES FIRST
  @Post('types')
  createType(@Body('name') name: string, @Req() req: any) {
    return this.service.createType(name, req.user);
  }

  @Get('types')
  getTypes() {
    return this.service.getTypes();
  }

  // -----------------------

  @Post()
  create(@Body() dto: any, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user);
  }
}
