import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Roles } from '../auth/decorator/roles.decorator';
import { AttentionService } from './attention.service';

@Controller('attention')
@Roles('DEACON')
export class AttentionController {
  constructor(private readonly attentionService: AttentionService) {}

  @Get('prayer-requests')
  getAllPrayers() {
    return this.attentionService.getPrayerRequests();
  }

  @Get('visitors')
  getAllVisitors() {
    return this.attentionService.getVisitors();
  }

  @Get('manage')
  getAll() {
    return this.attentionService.getAttentionOverview();
  }

  @Post('prayers/:id/prayed')
  markPrayed(@Param('id') id: string, @Req() req: any) {
    return this.attentionService.markPrayed(id, req.user);
  }

  @Post('visitors/:id/ack')
  acknowledge(@Param('id') id: string, @Req() req: any) {
    return this.attentionService.acknowledgeVisitor(id, req.user);
  }

  @Get('prayers/:id')
  getPrayer(@Param('id') id: string) {
    return this.attentionService.getPrayer(id);
  }

  @Get('visitors/:id')
  getVisitor(@Param('id') id: string) {
    return this.attentionService.getVisitor(id);
  }
}
