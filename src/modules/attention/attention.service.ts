import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePrayerRequestDto } from './dto/createPrayerRequestDto';
import { CreateVisitorDto } from './dto/createVisitorsDto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { Audit } from 'src/common/decorators/audit.decorator';

@Injectable()
export class AttentionService {
  private readonly logger = new Logger(AttentionService.name);

  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────
  // PRAYER REQUEST
  // ─────────────────────────────
  @Audit({
    action: 'PRAYER_REQUEST_CREATED',
    entity: 'PrayerRequest',
  })
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

    this.logger.log(`CREATE_PRAYER_REQUEST_SUCCESS: ${data.id}`);

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
  @Audit({
    action: 'VISITOR_CREATED',
    entity: 'Visitor',
  })
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

  @Audit({
    action: 'PRAYER_MARKED_PRAYED',
    entity: 'PrayerRequest',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async markPrayed(id: string, user: any) {
    if (!user?.member?.id) {
      throw new Error('User is not linked to a member');
    }

    this.logger.log(`MARK_PRAYER_PRAYED_STARTED: ${id}`);

    const [updated] = await this.prisma.$transaction([
      this.prisma.prayerRequest.update({
        where: { id: toBigInt(id) },
        data: {
          status: 'PRAYED_FOR',
        },
      }),

      this.prisma.attentionAction.create({
        data: {
          type: 'PRAYER_REQUEST',
          referenceId: id,
          action: 'PRAYED_FOR',
          performedById: user.member.id,
        },
      }),
    ]);

    this.logger.log(`MARK_PRAYER_PRAYED_SUCCESS: ${id}`);

    return {
      success: true,
      data: updated,
      meta: {},
    };
  }

  @Audit({
    action: 'VISITOR_ACKNOWLEDGED',
    entity: 'Visitor',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async acknowledgeVisitor(id: string, user: any) {
    if (!user?.member?.id) {
      throw new Error('User is not linked to a member');
    }

    this.logger.log(`ACKNOWLEDGE_VISITOR_STARTED: ${id}`);

    const [updated] = await this.prisma.$transaction([
      this.prisma.visitor.update({
        where: { id: toBigInt(id) },
        data: {
          status: 'CONFIRMED',
        },
      }),

      this.prisma.attentionAction.create({
        data: {
          type: 'VISITOR',
          referenceId: id,
          action: 'ACKNOWLEDGED',
          performedById: user.member.id,
        },
      }),
    ]);

    this.logger.log(`ACKNOWLEDGE_VISITOR_SUCCESS: ${id}`);

    return {
      success: true,
      data: updated,
      meta: {},
    };
  }

  // ─────────────────────────────
  // READ METHODS (NO AUDIT)
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
      this.logger.warn(`Prayer request ${id} not found`);
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
      this.logger.warn(`Visitor ${id} not found`);
      throw new NotFoundException('Visitor not found');
    }

    return { success: true, data, meta: {} };
  }
}
