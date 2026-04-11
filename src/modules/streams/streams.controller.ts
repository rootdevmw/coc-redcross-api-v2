import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { StreamsService } from './streams.service';

@Controller('streams')
export class StreamsController {
  constructor(private service: StreamsService) {}

  // -------------------------
  // PLATFORMS
  // -------------------------
  @Post('platforms')
  createPlatform(@Body() dto: any) {
    return this.service.createPlatform(dto);
  }

  @Get('platforms')
  getPlatforms() {
    return this.service.getPlatforms();
  }

  // -------------------------
  @Post()
  create(@Body() dto: any) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  //  STATIC ROUTES FIRST
  @Get('live')
  findLive() {
    return this.service.findLive();
  }

  // -------------------------
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.service.update(id, dto);
  }

  //  SET LIVE
  @Post(':id/live')
  setLive(@Param('id') id: string) {
    return this.service.setLive(id);
  }
}
