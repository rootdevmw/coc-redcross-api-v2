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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorator/roles.decorator';
import { ContentService } from './content.service';
import { CreateContentTypeDto } from './dto/create-content-type.dto';
import { CreateContentDto } from './dto/create-content.dto';
import { QueryContentDto } from './dto/query-content.dto';
import { UpdateContentDto } from './dto/update-content.dto';

@Controller('content')
@Roles('MEDIA')
export class ContentController {
  constructor(private service: ContentService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: Number(process.env.UPLOAD_MAX_FILE_SIZE) || 50 * 1024 * 1024,
      },
    }),
  )
  async uploadMedia(@UploadedFile() file: Express.Multer.File) {
    return this.service.uploadMedia(file);
  }

  @Post()
  create(@Body() dto: CreateContentDto, @Req() req: any) {
    return this.service.create(dto, req.user);
  }

  @Get()
  findAll(@Query() query: QueryContentDto) {
    return this.service.findAll(query);
  }

  @Post('types')
  createType(@Body() dto: CreateContentTypeDto, @Req() req: any) {
    return this.service.createType(dto.name, req.user);
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
  update(@Param('id') id: string, @Body() dto: UpdateContentDto, @Req() req: any) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.service.remove(id, req.user);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Body('status') status: string, @Req() req: any) {
    return this.service.publish(id, status, req.user);
  }
}
