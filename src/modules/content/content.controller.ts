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
import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';
import { QueryContentDto } from './dto/query-content.dto';
import { CreateContentTypeDto } from './dto/create-content-type.dto';

@Controller('content')
export class ContentController {
  constructor(private service: ContentService) {}

  @Post()
  create(@Body() dto: CreateContentDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryContentDto) {
    return this.service.findAll(query);
  }

  @Post('types')
  createType(@Body() dto: CreateContentTypeDto) {
    return this.service.createType(dto.name);
  }

  @Get('types')
  getTypes() {
    return this.service.getTypes();
  }
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Body('status') status: string) {
    return this.service.publish(id, status);
  }
}
