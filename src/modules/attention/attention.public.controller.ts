import { Body, Controller, Get, Post } from '@nestjs/common';
import { AttentionService } from './attention.service';
import { CreatePrayerRequestDto } from './dto/createPrayerRequestDto';
import { CreateVisitorDto } from './dto/createVisitorsDto';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('public/attention')
export class PublicAttentionController {
  constructor(private readonly attentionService: AttentionService) {}

  // ───────────────────────
  // PRAYER REQUESTS
  // ───────────────────────
  @Post('prayer-requests')
  @Public()
  createPrayer(@Body() dto: CreatePrayerRequestDto) {
    return this.attentionService.createPrayerRequest(dto);
  }
  // ───────────────────────
  // VISITORS
  // ───────────────────────
  @Post('visitors')
  @Public()
  createVisitor(@Body() dto: CreateVisitorDto) {
    return this.attentionService.createVisitor(dto);
  }
}
