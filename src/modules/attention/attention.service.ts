import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePrayerRequestDto } from './dto/createPrayerRequestDto';
import { CreateVisitorDto } from './dto/createVisitorsDto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class AttentionService {
  private readonly logger = new Logger(AttentionService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private emailService: EmailService,
  ) {}

  // ─────────────────────────────
  // PRAYER REQUEST
  // ─────────────────────────────
  async createPrayerRequest(dto: CreatePrayerRequestDto) {
    this.logger.log('CREATE_PRAYER_REQUEST_STARTED');

    const data = await this.prisma.prayerRequest.create({
      data: {
        name: dto.name || null,
        phone: dto.phone || null,
        email: dto.email || null,
        requestType: dto.requestType || null,
        prayerFor: dto.prayerFor,
        request: dto.request,
        isUrgent: dto.isUrgent ?? false,
        shareWithElders: dto.shareWithElders !== 'No',
      },
    });

    await this.auditService.log({
      action: 'PRAYER_REQUEST_CREATED',
      entity: 'PrayerRequest',
      entityId: data.id.toString(),
      after: data,
    });

    this.logger.log(`CREATE_PRAYER_REQUEST_SUCCESS: ${data.id}`);

    // ─────────────────────────────
    // NOTIFY PRAYER WARRIORS
    // ─────────────────────────────
    const warriors = await this.prisma.prayerWarrior.findMany({
      include: {
        user: {
          include: {
            member: true,
          },
        },
      },
    });

    const validWarriors = warriors.filter((w) => w.user?.member);

    await Promise.all(
      validWarriors.map((w) =>
        this.emailService.sendPrayerRequestNotification(w.user.email, data),
      ),
    );

    this.logger.log(`PRAYER_REQUEST_NOTIFIED_WARRIORS: ${warriors.length}`);

    return { success: true, data, meta: {} };
  }

  async getPrayerRequests() {
    this.logger.log('Fetching prayer requests');

    const data = await this.prisma.prayerRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data, meta: {} };
  }

  // ─────────────────────────────
  // VISITORS
  // ─────────────────────────────
  async createVisitor(dto: CreateVisitorDto) {
    this.logger.log('CREATE_VISITOR_STARTED');

    const data = await this.prisma.visitor.create({
      data: {
        name: dto.name,
        phone: dto.phone || null,
        email: dto.email || null,
        visitDate: new Date(dto.visitDate),
        groupSize: dto.groupSize,
        isChurchOfChrist: dto.isChurchOfChrist || null,
        language: dto.language || null,
        hasSpecialNeeds: dto.hasSpecialNeeds === 'Yes',
        specialNeedsDetails: dto.specialNeedsDetails || null,
        message: dto.message || null,
      },
    });

    await this.auditService.log({
      action: 'VISITOR_CREATED',
      entity: 'Visitor',
      entityId: data.id.toString(),
      after: data,
    });

    this.logger.log(`CREATE_VISITOR_SUCCESS: ${data.id}`);

    return { success: true, data, meta: {} };
  }

  async getVisitors() {
    this.logger.log('Fetching visitors');

    const data = await this.prisma.visitor.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data, meta: {} };
  }

  // ─────────────────────────────
  // ACTIONS
  // ─────────────────────────────
  async markPrayed(id: string, user: any) {
    if (!user?.member?.id) {
      throw new Error('User is not linked to a member');
    }

    this.logger.log(`MARK_PRAYER_PRAYED_STARTED: ${id}`);

    const before = await this.prisma.prayerRequest.findFirst({
      where: { id: toBigInt(id) },
    });

    if (!before) {
      throw new NotFoundException('Prayer request not found');
    }

    const updated = await this.prisma.prayerRequest.update({
      where: { id: toBigInt(id) },
      data: {
        status: 'PRAYED_FOR',
      },
    });

    await this.prisma.attentionAction.create({
      data: {
        type: 'PRAYER_REQUEST',
        referenceId: id,
        action: 'PRAYED_FOR',
        performedById: user.member.id,
      },
    });

    await this.auditService.log({
      action: 'PRAYER_MARKED_PRAYED',
      entity: 'PrayerRequest',
      entityId: id,
      before,
      after: updated,
      userId: user.id,
    });

    this.logger.log(`MARK_PRAYER_PRAYED_SUCCESS: ${id}`);

    // ─────────────────────────────
    // NOTIFY PRAYER WARRIORS (COMPLETED)
    // ─────────────────────────────
    const warriors = await this.prisma.prayerWarrior.findMany({
      include: {
        user: {
          include: {
            member: true,
          },
        },
      },
    });

    const validWarriors = warriors.filter((w) => w.user?.member);

    await Promise.all(
      validWarriors.map((w) =>
        this.emailService.sendPrayerCompletedNotification(
          w.user.email,
          updated,
        ),
      ),
    );

    this.logger.log(`PRAYER_COMPLETED_NOTIFIED_WARRIORS: ${warriors.length}`);

    return {
      success: true,
      data: updated,
      meta: {},
    };
  }

  async acknowledgeVisitor(id: string, user: any) {
    if (!user?.member?.id) {
      throw new Error('User is not linked to a member');
    }

    this.logger.log(`ACKNOWLEDGE_VISITOR_STARTED: ${id}`);

    const before = await this.prisma.visitor.findFirst({
      where: { id: toBigInt(id) },
    });

    if (!before) {
      throw new NotFoundException('Visitor not found');
    }

    const updated = await this.prisma.visitor.update({
      where: { id: toBigInt(id) },
      data: {
        status: 'CONFIRMED',
      },
    });

    await this.prisma.attentionAction.create({
      data: {
        type: 'VISITOR',
        referenceId: id,
        action: 'ACKNOWLEDGED',
        performedById: user.member.id,
      },
    });

    await this.auditService.log({
      action: 'VISITOR_ACKNOWLEDGED',
      entity: 'Visitor',
      entityId: id,
      before,
      after: updated,
      userId: user.id,
    });

    this.logger.log(`ACKNOWLEDGE_VISITOR_SUCCESS: ${id}`);

    return {
      success: true,
      data: updated,
      meta: {},
    };
  }

  // ─────────────────────────────
  // PRAYER WARRIORS
  // ─────────────────────────────

  async addPrayerWarrior(userId: string, actorUserId: string) {
    this.logger.log(`ADD_PRAYER_WARRIOR_STARTED: ${userId}`);

    const user = await this.prisma.user.findFirst({
      where: { id: toBigInt(userId) },
      include: { member: true },
    });

    if (!user) throw new NotFoundException('User not found');

    if (!user.email) {
      throw new Error('User must have a valid email');
    }

    if (!user.member) {
      throw new Error('User must be linked to a member');
    }

    const data = await this.prisma.prayerWarrior.create({
      data: {
        userId: user.id,
      },
    });

    await this.auditService.log({
      action: 'PRAYER_WARRIOR_ADDED',
      entity: 'PrayerWarrior',
      entityId: userId,
      userId: toBigInt(actorUserId),
      after: data,
    });

    this.logger.log(`ADD_PRAYER_WARRIOR_SUCCESS: ${userId}`);

    return { success: true, data };
  }

  async removePrayerWarrior(userId: string, actorUserId: string) {
    this.logger.log(`REMOVE_PRAYER_WARRIOR_STARTED: ${userId}`);

    await this.prisma.prayerWarrior.delete({
      where: { userId: toBigInt(userId) },
    });
    await this.auditService.log({
      action: 'PRAYER_WARRIOR_REMOVED',
      entity: 'PrayerWarrior',
      entityId: userId,
      userId: toBigInt(actorUserId),
    });

    this.logger.log(`REMOVE_PRAYER_WARRIOR_SUCCESS: ${userId}`);

    return { success: true };
  }

  async getPrayerWarriors() {
    this.logger.log('FETCHING_PRAYER_WARRIORS');

    const data = await this.prisma.prayerWarrior.findMany({
      include: {
        user: {
          include: {
            member: true,
          },
        },
      },
    });

    return {
      success: true,
      data,
      meta: {},
    };
  }

  // ─────────────────────────────
  // OVERVIEW + READ METHODS
  // ─────────────────────────────
  async getAttentionOverview() {
    this.logger.log('Fetching attention overview');

    const [prayers, visitors, prayerCount, visitorCount] = await Promise.all([
      this.prisma.prayerRequest.findMany({
        where: { status: { not: 'PRAYED_FOR' } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.visitor.findMany({
        where: { status: { not: 'CONFIRMED' } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.prayerRequest.count({
        where: { status: { not: 'PRAYED_FOR' } },
      }),
      this.prisma.visitor.count({
        where: { status: { not: 'CONFIRMED' } },
      }),
    ]);

    this.logger.log(
      `Attention fetched: ${prayerCount} prayers, ${visitorCount} visitors`,
    );

    return {
      success: true,
      data: { prayers, visitors },
      meta: {
        counts: { prayers: prayerCount, visitors: visitorCount },
      },
    };
  }

  async getPrayer(id: string) {
    this.logger.log(`Fetching prayer request ${id}`);

    const data = await this.prisma.prayerRequest.findFirst({
      where: { id: toBigInt(id) },
    });

    if (!data) {
      throw new NotFoundException('Prayer request not found');
    }

    return { success: true, data, meta: {} };
  }

  async getVisitor(id: string) {
    this.logger.log(`Fetching visitor ${id}`);

    const data = await this.prisma.visitor.findFirst({
      where: { id: toBigInt(id) },
    });

    if (!data) {
      throw new NotFoundException('Visitor not found');
    }

    return { success: true, data, meta: {} };
  }
}
