import { Module } from '@nestjs/common';
import { HomecellsService } from './homecells.service';
import { HomecellsController } from './homecells.controller';
import { PublicHomecellsController } from './homecells.public.controller';

@Module({
  controllers: [HomecellsController, PublicHomecellsController],
  providers: [HomecellsService],
})
export class HomecellsModule {}
