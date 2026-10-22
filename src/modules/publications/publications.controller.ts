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
import { Roles } from '../auth/decorator/roles.decorator';
import { PublicationService } from './publications.service';
import { memoryStorage } from 'multer';
import { PUBLICATION_FILE_LIMIT } from './publication-editor';
import { CreatePublicationDto } from './dto/create-publication.dto';
import { UpdatePublicationDto } from './dto/update-publication.dto';
import { QueryPublicationDto } from './dto/query-publication.dto';

type PublicationRequest = { user?: { id?: bigint } };

@Controller('publications')
@Roles('MEDIA')
export class PublicationsController {
  constructor(private service: PublicationService) {}

  // -----------------------------
  // PUBLISH
  // -----------------------------
  @Patch(':id/publish')
  publish(@Param('id') id: string, @Req() req: PublicationRequest) {
    return this.service.publish(id, req.user);
  }

  // -----------------------------
  // UNPUBLISH
  // -----------------------------
  @Patch(':id/unpublish')
  unpublish(@Param('id') id: string, @Req() req: PublicationRequest) {
    return this.service.unpublish(id, req.user);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: PUBLICATION_FILE_LIMIT,
        files: 1,
        fields: 4,
        fieldSize: 65535,
      },
    }),
  )
  create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: CreatePublicationDto,
    @Req() req: PublicationRequest,
  ) {
    return this.service.create(dto, req.user, file);
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: PUBLICATION_FILE_LIMIT,
        files: 1,
        fields: 4,
        fieldSize: 65535,
      },
    }),
  )
  update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UpdatePublicationDto,
    @Req() req: PublicationRequest,
  ) {
    return this.service.update(id, dto, req.user, file);
  }

  @Get()
  findAll(@Query() query: QueryPublicationDto) {
    return this.service.findAll(query, 'management');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id, 'management');
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: PublicationRequest) {
    return this.service.remove(id, req.user);
  }
}
