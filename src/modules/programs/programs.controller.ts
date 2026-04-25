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
import { ProgramsService } from './programs.service';
import { CreateProgramFromTemplateDto } from './dto/create-from-template.dto';

@Controller('programs')
export class ProgramsController {
  constructor(private service: ProgramsService) {}

  // STATIC FIRST
  @Post('types')
  createType(@Body('name') name: string) {
    return this.service.createType(name);
  }

  @Get('types')
  getTypes() {
    return this.service.getTypes();
  }

  @Post('from-template')
  createFromTemplate(@Body() dto: CreateProgramFromTemplateDto, @Req() req: any) {
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
