import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePrayerRequestDto } from './dto/createPrayerRequestDto';
import { CreateVisitorDto } from './dto/createVisitorsDto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { prayerNotificationUser } from '../../common/utils/prayer-team';

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
      where: { user: { is: prayerNotificationUser } },
      select: {
        user: { select: { email: true, member: { select: { id: true } } } },
      },
    });

    const validWarriors = warriors.filter(
      (w) => w.user?.member && w.user.email.trim(),
    );

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
      throw new ForbiddenException(
        'Link your account to a directory profile before recording follow-up.',
      );
    }

    this.logger.log(`MARK_PRAYER_PRAYED_STARTED: ${id}`);

    const { before, updated, changed } = await this.prisma.$transaction(
      async (tx) => {
        const before = await tx.prayerRequest.findFirst({
          where: { id: toBigInt(id) },
        });
        if (!before) throw new NotFoundException('Prayer request not found');
        if (before.status === 'PRAYED_FOR')
          return { before, updated: before, changed: false };
        const transition = await tx.prayerRequest.updateMany({
          where: { id: before.id, status: { in: ['PENDING', 'REVIEWED'] } },
          data: { status: 'PRAYED_FOR' },
        });
        const updated = await tx.prayerRequest.findFirst({
          where: { id: before.id },
        });
        if (!updated) throw new NotFoundException('Prayer request not found');
        if (!transition.count) return { before, updated, changed: false };
        await tx.attentionAction.create({
          data: {
            type: 'PRAYER_REQUEST',
            referenceId: id,
            action: 'PRAYED_FOR',
            performedById: user.member.id,
          },
        });
        return { before, updated, changed: true };
      },
      { isolationLevel: 'ReadCommitted' },
    );
    if (!changed)
      return { success: true, data: updated, meta: { changed: false } };

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
      where: { user: { is: prayerNotificationUser } },
      select: {
        user: { select: { email: true, member: { select: { id: true } } } },
      },
    });

    const validWarriors = warriors.filter(
      (w) => w.user?.member && w.user.email.trim(),
    );

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
      throw new ForbiddenException(
        'Link your account to a directory profile before recording follow-up.',
      );
    }

    this.logger.log(`ACKNOWLEDGE_VISITOR_STARTED: ${id}`);

    const { before, updated, changed } = await this.prisma.$transaction(
      async (tx) => {
        const before = await tx.visitor.findFirst({
          where: { id: toBigInt(id) },
        });
        if (!before) throw new NotFoundException('Visitor not found');
        if (before.status !== 'PENDING')
          return { before, updated: before, changed: false };
        const transition = await tx.visitor.updateMany({
          where: { id: before.id, status: 'PENDING' },
          data: { status: 'CONFIRMED' },
        });
        const updated = await tx.visitor.findFirst({
          where: { id: before.id },
        });
        if (!updated) throw new NotFoundException('Visitor not found');
        if (!transition.count) return { before, updated, changed: false };
        await tx.attentionAction.create({
          data: {
            type: 'VISITOR',
            referenceId: id,
            action: 'ACKNOWLEDGED',
            performedById: user.member.id,
          },
        });
        return { before, updated, changed: true };
      },
      { isolationLevel: 'ReadCommitted' },
    );
    if (!changed)
      return { success: true, data: updated, meta: { changed: false } };

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
  // Prayer-team reads and membership changes live in PrayerTeamService.
  // ─────────────────────────────

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
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.prayerRequest.count({
        where: { status: { not: 'PRAYED_FOR' } },
      }),
      this.prisma.visitor.count({
        where: { status: 'PENDING' },
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
