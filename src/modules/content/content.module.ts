import { Module } from '@nestjs/common';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { PublicContentController } from './content.public.controller';

@Module({
  controllers: [ContentController, PublicContentController],
  providers: [ContentService],
})
export class ContentModule {}
