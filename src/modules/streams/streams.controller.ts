import {
  Req,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Delete,
} from '@nestjs/common';
import { Roles } from '../auth/decorator/roles.decorator';
import { StreamsService, type StreamQuery } from './streams.service';

type StreamRequest = { user?: { id?: bigint } };

@Controller('streams')
@Roles('MEDIA')
export class StreamsController {
  constructor(private service: StreamsService) {}

  // -------------------------
  // PLATFORMS
  // -------------------------
  @Post('platforms')
  createPlatform(@Body() dto: unknown, @Req() req: StreamRequest) {
    return this.service.createPlatform(dto, req.user);
  }

  @Patch('platforms/:id')
  updatePlatform(
    @Param('id') id: string,
    @Body() dto: { name?: unknown; url?: unknown },
    @Req() req: StreamRequest,
  ) {
    return this.service.updatePlatform({ ...dto, id }, req.user);
  }

  @Get('platforms')
  getPlatforms() {
    return this.service.getPlatforms();
  }

  // -------------------------
  @Post()
  create(@Body() dto: unknown, @Req() req: StreamRequest) {
    return this.service.create(dto, req.user);
  }

  @Get()
  findAll(@Query() query: StreamQuery) {
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
  update(
    @Param('id') id: string,
    @Body() dto: unknown,
    @Req() req: StreamRequest,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: StreamRequest) {
    return this.service.remove(id, req.user);
  }

  //  SET LIVE
  @Post(':id/live')
  setLive(@Param('id') id: string, @Req() req: StreamRequest) {
    return this.service.setLive(id, req.user);
  }
  @Post(':id/end')
  endLive(@Param('id') id: string, @Req() req: StreamRequest) {
    return this.service.endLive(id, req.user);
  }
}
