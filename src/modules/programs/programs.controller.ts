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
import { ProgramsService } from './programs.service';
import { CreateProgramFromTemplateDto } from './dto/create-from-template.dto';

@Controller('programs')
@Roles('DEACON')
export class ProgramsController {
  constructor(private service: ProgramsService) {}

  // STATIC FIRST
  @Post('types')
  createType(@Body('name') name: string, @Req() req: any) {
    return this.service.createType(name, req.user);
  }

  @Patch('types/:id')
  updateType(@Param('id') id: string, @Body('name') name: string, @Req() req: any) {
    return this.service.updateType(id, name, req.user);
  }

  @Delete('types/:id')
  removeType(@Param('id') id: string, @Req() req: any) {
    return this.service.removeType(id, req.user);
  }

  @Get('types')
  getTypes() {
    return this.service.getTypes();
  }

  @Post('from-template')
  createFromTemplate(
    @Body() dto: CreateProgramFromTemplateDto,
    @Req() req: any,
  ) {
    return this.service.createFromTemplate(dto, req.user);
  }
  // -------------------------

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
