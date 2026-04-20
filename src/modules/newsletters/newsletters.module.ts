import { Module } from '@nestjs/common';
import { NewslettersController } from './newsletters.controller';
import { PublicNewslettersController } from './newsletters.public.controller';
import { NewslettersService } from './newsletters.service';

@Module({
  controllers: [NewslettersController, PublicNewslettersController],
  providers: [NewslettersService],
})
export class NewslettersModule {}
