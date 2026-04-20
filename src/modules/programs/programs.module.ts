import { Module } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { ProgramsController } from './programs.controller';
import { PublicProgramsController } from './programs.public.controller';

@Module({
  controllers: [ProgramsController, PublicProgramsController],
  providers: [ProgramsService],
})
export class ProgramsModule {}
