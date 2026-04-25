import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { QueryAnnouncementDto } from './dto/query-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { Audit } from 'src/common/decorators/audit.decorator';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(private prisma: PrismaService) {}

  // -----------------------------
  // CREATE
  // -----------------------------
  @Audit({
    action: 'ANNOUNCEMENT_CREATED',
    entity: 'Announcement',
  })
  async create(dto: CreateAnnouncementDto) {
    this.logger.log(`CREATE_ANNOUNCEMENT_STARTED: ${dto.title}`);

    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        body: dto.body,
        priority: dto.priority,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        targets: {
          create: dto.targets.map((t) => ({
            targetType: t.targetType,
            targetId: toBigInt(t.targetId),
          })),
        },
      },
      include: {
        targets: true,
      },
    });

    this.logger.log(`CREATE_ANNOUNCEMENT_SUCCESS: ${announcement.id}`);

    return { success: true, data: announcement, meta: {} };
  }

  // -----------------------------
  // FIND ALL (NO AUDIT)
  // -----------------------------
  async findAll(query: QueryAnnouncementDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    this.logger.log(`Fetching announcements`);

    const where: any = {};

    if (query.activeOnly) {
      where.OR = [{ expiryDate: null }, { expiryDate: { gt: new Date() } }];
    }

    const [data, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        include: {
          targets: true,
        },
      }),
      this.prisma.announcement.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: { page, limit, total },
    };
  }

  // -----------------------------
  // MEMBER FILTER (NO AUDIT)
  // -----------------------------
  async findForMember(memberId: string) {
    this.logger.log(`Fetching announcements for member ${memberId}`);

    const member = await this.prisma.member.findFirst({
      where: { id: toBigInt(memberId) },
      include: {
        ministries: true,
      },
    });

    const ministryIds = member?.ministries.map((m) => m.ministryId);
    const homecellId = member?.homecellId;

    const conditions: any[] = [];

    if (ministryIds?.length) {
      conditions.push({
        targets: {
          some: {
            targetType: 'MINISTRY',
            targetId: { in: ministryIds },
          },
        },
      });
    }

    if (homecellId) {
      conditions.push({
        targets: {
          some: {
            targetType: 'HOMECELL',
            targetId: homecellId,
          },
        },
      });
    }

    if (!conditions.length) {
      this.logger.warn(`No targeting data for member ${memberId}`);
      return { success: true, data: [], meta: {} };
    }

    const announcements = await this.prisma.announcement.findMany({
      where: {
        AND: [
          { OR: conditions },
          {
            OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }],
          },
        ],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return { success: true, data: announcements, meta: {} };
  }

  // -----------------------------
  // FIND ONE (NO AUDIT)
  // -----------------------------
  async findOne(id: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id: toBigInt(id) },
      include: {
        targets: true,
      },
    });

    if (!announcement) throw new NotFoundException('Announcement not found');

    return {
      success: true,
      data: announcement,
      meta: {},
    };
  }

  // -----------------------------
  // UPDATE
  // -----------------------------
  @Audit({
    action: 'ANNOUNCEMENT_UPDATED',
    entity: 'Announcement',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async update(id: string, dto: UpdateAnnouncementDto) {
    this.logger.log(`UPDATE_ANNOUNCEMENT_STARTED: ${id}`);

    const announcementId = toBigInt(id);

    // Keep validation (important!)
    const existing = await this.prisma.announcement.findFirst({
      where: { id: announcementId },
    });

    if (!existing) throw new NotFoundException('Announcement not found');

    if (dto.targets) {
      await this.prisma.announcementTarget.deleteMany({
        where: { announcementId },
      });
    }

    const updated = await this.prisma.announcement.update({
      where: { id: announcementId },
      data: {
        title: dto.title,
        body: dto.body,
        priority: dto.priority,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        targets: dto.targets
          ? {
              create: dto.targets.map((t) => ({
                targetType: t.targetType,
                targetId: toBigInt(t.targetId),
              })),
            }
          : undefined,
      },
      include: { targets: true },
    });

    this.logger.log(`UPDATE_ANNOUNCEMENT_SUCCESS: ${id}`);

    return {
      success: true,
      data: updated,
      meta: {},
    };
  }

  // -----------------------------
  // DELETE
  // -----------------------------
  @Audit({
    action: 'ANNOUNCEMENT_DELETED',
    entity: 'Announcement',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async remove(id: string) {
    this.logger.log(`DELETE_ANNOUNCEMENT_STARTED: ${id}`);

    const announcementId = toBigInt(id);

    const existing = await this.prisma.announcement.findFirst({
      where: { id: announcementId },
    });

    if (!existing) throw new NotFoundException('Announcement not found');

    await this.prisma.announcement.delete({
      where: { id: announcementId },
    });

    this.logger.log(`DELETE_ANNOUNCEMENT_SUCCESS: ${id}`);

    return {
      success: true,
      data: {},
      meta: {},
    };
  }
}
