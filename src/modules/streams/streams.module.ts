import { Module } from '@nestjs/common';
import { StreamsService } from './streams.service';
import { StreamsController } from './streams.controller';
import { PublicStreamsController } from './streams.public.controller';

@Module({
  controllers: [StreamsController, PublicStreamsController],
  providers: [StreamsService],
})
export class StreamsModule {}
