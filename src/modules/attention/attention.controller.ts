import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Body,
  Delete,
} from '@nestjs/common';
import { Roles } from '../auth/decorator/roles.decorator';
import { AttentionService } from './attention.service';

@Controller('attention')
@Roles('DEACON')
export class AttentionController {
  constructor(private readonly attentionService: AttentionService) {}

  // ─────────────────────────────
  // PRAYER REQUESTS
  // ─────────────────────────────
  @Get('prayer-requests')
  getAllPrayers() {
    return this.attentionService.getPrayerRequests();
  }

  @Get('prayers/:id')
  getPrayer(@Param('id') id: string) {
    return this.attentionService.getPrayer(id);
  }

  @Post('prayers/:id/prayed')
  markPrayed(@Param('id') id: string, @Req() req: any) {
    return this.attentionService.markPrayed(id, req.user);
  }

  // ─────────────────────────────
  // VISITORS
  // ─────────────────────────────
  @Get('visitors')
  getAllVisitors() {
    return this.attentionService.getVisitors();
  }

  @Get('visitors/:id')
  getVisitor(@Param('id') id: string) {
    return this.attentionService.getVisitor(id);
  }

  @Post('visitors/:id/ack')
  acknowledge(@Param('id') id: string, @Req() req: any) {
    return this.attentionService.acknowledgeVisitor(id, req.user);
  }

  // ─────────────────────────────
  // OVERVIEW
  // ─────────────────────────────
  @Get('manage')
  getAll() {
    return this.attentionService.getAttentionOverview();
  }

  // ─────────────────────────────
  // PRAYER WARRIORS
  // ─────────────────────────────

  @Get('prayer-warriors')
  getPrayerWarriors() {
    return this.attentionService.getPrayerWarriors();
  }

  @Post('prayer-warriors')
  addPrayerWarrior(@Body() body: { userId: string }, @Req() req: any) {
    return this.attentionService.addPrayerWarrior(body.userId, req.user.id);
  }

  @Delete('prayer-warriors/:userId')
  removePrayerWarrior(@Param('userId') userId: string, @Req() req: any) {
    return this.attentionService.removePrayerWarrior(userId, req.user.id);
  }
}
