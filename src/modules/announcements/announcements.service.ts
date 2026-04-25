import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { QueryAnnouncementDto } from './dto/query-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { Audit } from 'src/common/decorators/audit.decorator';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // -----------------------------
  // CREATE
  // -----------------------------
  async create(dto: CreateAnnouncementDto, user: any) {
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

    await this.auditService.log({
      action: 'ANNOUNCEMENT_CREATED',
      entity: 'Announcement',
      entityId: announcement.id.toString(),
      after: announcement,
      userId: user.id,
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
  async update(id: string, dto: UpdateAnnouncementDto, user: any) {
    this.logger.log(`UPDATE_ANNOUNCEMENT_STARTED: ${id}`);

    const announcementId = toBigInt(id);

    const before = await this.prisma.announcement.findFirst({
      where: { id: announcementId },
      include: { targets: true },
    });

    if (!before) throw new NotFoundException('Announcement not found');

    // Replace targets if provided
    if (dto.targets) {
      await this.prisma.announcementTarget.deleteMany({
        where: { announcementId },
      });
    }

    const after = await this.prisma.announcement.update({
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

    await this.auditService.log({
      action: 'ANNOUNCEMENT_UPDATED',
      entity: 'Announcement',
      entityId: id,
      userId: user.id,
      before,
      after,
    });

    this.logger.log(`UPDATE_ANNOUNCEMENT_SUCCESS: ${id}`);

    return {
      success: true,
      data: after,
      meta: {},
    };
  }

  // -----------------------------
  // DELETE
  // -----------------------------
  async remove(id: string, user: any) {
    this.logger.log(`DELETE_ANNOUNCEMENT_STARTED: ${id}`);

    const announcementId = toBigInt(id);

    const before = await this.prisma.announcement.findFirst({
      where: { id: announcementId },
      include: { targets: true },
    });

    if (!before) throw new NotFoundException('Announcement not found');

    await this.prisma.announcement.delete({
      where: { id: announcementId },
    });

    await this.auditService.log({
      action: 'ANNOUNCEMENT_DELETED',
      entity: 'Announcement',
      entityId: id,
      userId: user.id,
      before,
    });

    this.logger.log(`DELETE_ANNOUNCEMENT_SUCCESS: ${id}`);

    return {
      success: true,
      data: {},
      meta: {},
    };
  }
}
