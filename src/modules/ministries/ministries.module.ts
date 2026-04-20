import { Module } from '@nestjs/common';
import { MinistriesService } from './ministries.service';
import { MinistriesController } from './ministries.controller';
import { PublicMinistriesController } from './ministries.public.controller';

@Module({
  controllers: [MinistriesController, PublicMinistriesController],
  providers: [MinistriesService],
})
export class MinistriesModule {}
