import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { NewslettersService } from './newsletters.service';

@Controller('newsletters')
export class NewslettersController {
  constructor(private service: NewslettersService) {}

  // -----------------------------
  // PUBLISH
  // -----------------------------
  @Patch(':id/publish')
  publish(@Param('id') id: string, @Req() req: any) {
    return this.service.publish(id, req.user);
  }

  // -----------------------------
  // UNPUBLISH
  // -----------------------------
  @Patch(':id/unpublish')
  unpublish(@Param('id') id: string, @Req() req: any) {
    return this.service.unpublish(id, req.user);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(@UploadedFile() file: Express.Multer.File, @Body() dto: any, @Req() req: any) {
    return this.service.create(dto, req.user, file);
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('file'))
  update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: any,
    @Req() req: any,
  ) {
    return this.service.update(id, dto, req.user, file);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user);
  }
}
