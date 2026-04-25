import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ProgramTemplatesService } from './program-template.service';
import { CreateProgramTemplateDto } from './dto/create-program-template.dto';
import { UpdateProgramTemplateDto } from './dto/update-program-template.dto';

@Controller('program-templates')
export class ProgramTemplatesController {
  constructor(private service: ProgramTemplatesService) {}

  @Post()
  create(@Body() dto: CreateProgramTemplateDto, @Req() req: any) {
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
  update(@Param('id') id: string, @Body() dto: UpdateProgramTemplateDto, @Req() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user);
  }
}
