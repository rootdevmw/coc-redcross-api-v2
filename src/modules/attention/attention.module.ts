import { Module } from '@nestjs/common';
import { AttentionService } from './attention.service';
import { AttentionController } from './attention.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { PublicAttentionController } from './attention.public.controller';

@Module({
  controllers: [AttentionController, PublicAttentionController],
  providers: [AttentionService, PrismaService],
})
export class AttentionModule {}
