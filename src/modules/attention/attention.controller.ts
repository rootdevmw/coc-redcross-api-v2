import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Body,
  Delete,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorator/roles.decorator';
import { AttentionService } from './attention.service';
import { AttentionQueueService } from './attention.queue.service';
import type { AttentionQueueQuery } from '../../common/utils/attention-queue-filters';
import { PrayerTeamService } from './prayer-team.service';
import type { PrayerTeamQuery } from '../../common/utils/prayer-team';

@Controller('attention')
@Roles('DEACON')
export class AttentionController {
  constructor(
    private readonly attentionService: AttentionService,
    private readonly queueService: AttentionQueueService,
    private readonly prayerTeam: PrayerTeamService,
  ) {}

  @Get('queues/prayers')
  prayerQueue(
    @Query() query: AttentionQueueQuery,
    @Req() req: { user: { member?: { id?: bigint } } },
  ) {
    return this.queueService.prayers(query, !!req.user.member?.id);
  }

  @Get('queues/visitors')
  visitorQueue(
    @Query() query: AttentionQueueQuery,
    @Req() req: { user: { member?: { id?: bigint } } },
  ) {
    return this.queueService.visitors(query, !!req.user.member?.id);
  }

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
    return this.prayerTeam.legacyRoster();
  }

  @Get('prayer-team')
  teamRoster(@Query() query: PrayerTeamQuery) {
    return this.prayerTeam.roster(query);
  }

  @Get('prayer-team/eligible')
  eligibleTeamAccounts(@Query() query: PrayerTeamQuery) {
    return this.prayerTeam.eligible(query);
  }

  @Post('prayer-warriors')
  addPrayerWarrior(
    @Body() body: { userId?: unknown } | null,
    @Req() req: { user: { id: bigint } },
  ) {
    return this.prayerTeam.add(body?.userId, req.user.id);
  }

  @Delete('prayer-warriors/:userId')
  removePrayerWarrior(
    @Param('userId') userId: string,
    @Req() req: { user: { id: bigint } },
  ) {
    return this.prayerTeam.remove(userId, req.user.id);
  }
}
