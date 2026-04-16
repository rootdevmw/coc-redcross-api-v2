import { Module } from '@nestjs/common';
import { ProgramTemplatesController } from './program-template.controller';
import { ProgramTemplatesService } from './program-template.service';

@Module({
  controllers: [ProgramTemplatesController],
  providers: [ProgramTemplatesService],
})
export class ProgramTemplatesModule {}
