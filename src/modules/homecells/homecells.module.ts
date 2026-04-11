import { Module } from '@nestjs/common';
import { HomecellsService } from './homecells.service';
import { HomecellsController } from './homecells.controller';

@Module({
  controllers: [HomecellsController],
  providers: [HomecellsService],
})
export class HomecellsModule {}
