import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMemberDto } from './dto/query-member.dto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // -----------------------------
  // CREATE
  // -----------------------------
  async create(dto: CreateMemberDto) {
    this.logger.log(`CREATE_MEMBER_STARTED: ${dto.firstName} ${dto.lastName}`);

    const member = await this.prisma.member.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        prefix: dto.prefix,
        phone: dto.phone,
        status: dto.status,
        location: dto.location,
        homecell: dto.homecellId
          ? { connect: { id: toBigInt(dto.homecellId) } }
          : undefined,
        baptized: dto.isBaptized,
        baptismDate: dto.baptismDate ? new Date(dto.baptismDate) : null,
        bio: dto.bio?.trim() ? { create: { bio: dto.bio } } : undefined,
      },
      include: {
        bio: true,
        homecell: true,
      },
    });

    await this.auditService.log({
      action: 'MEMBER_CREATED',
      entity: 'Member',
      entityId: member.id.toString(),
      after: member,
    });

    this.logger.log(`CREATE_MEMBER_SUCCESS: ${member.id}`);

    return {
      success: true,
      data: member,
      meta: {},
    };
  }

  // -----------------------------
  // FIND ALL
  // -----------------------------
  async findAll(query: QueryMemberDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    this.logger.log(`FETCH_MEMBERS_STARTED: page=${page} limit=${limit}`);

    const where: any = {};

    if (query.status) where.status = query.status;
    if (query.homecellId) where.homecellId = query.homecellId;
    if (query.prefix) where.prefix = query.prefix;

    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          homecell: true,
          ministries: {
            where: {
              ministry: { deletedAt: null },
            },
            include: {
              ministry: true,
            },
          },
        },
      }),
      this.prisma.member.count({ where }),
    ]);

    this.logger.log(
      `FETCH_MEMBERS_SUCCESS: returned=${data.length} total=${total}`,
    );

    return {
      success: true,
      data,
      meta: { page, limit, total },
    };
  }

  // -----------------------------
  // FIND ONE
  // -----------------------------
  async findOne(id: string) {
    this.logger.log(`FETCH_MEMBER_STARTED: ${id}`);

    const member = await this.prisma.member.findFirst({
      where: { id: toBigInt(id) },
      include: {
        homecell: true,
        ministries: {
          where: {
            ministry: { deletedAt: null },
          },
          include: { ministry: true },
        },
      },
    });

    if (!member) throw new NotFoundException('Member not found');

    this.logger.log(`FETCH_MEMBER_SUCCESS: ${id}`);

    return {
      success: true,
      data: member,
    };
  }

  // -----------------------------
  // UPDATE
  // -----------------------------
  async update(id: string, dto: UpdateMemberDto) {
    const memberId = toBigInt(id);

    this.logger.log(`UPDATE_MEMBER_STARTED: ${id}`);

    const before = await this.prisma.member.findFirst({
      where: { id: memberId },
    });

    if (!before) throw new NotFoundException('Member not found');

    const after = await this.prisma.member.update({
      where: { id: memberId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        prefix: dto.prefix,
        phone: dto.phone,
        status: dto.status,
        baptized: dto.isBaptized,
        location: dto.location,
        homecellId: dto.homecellId ? toBigInt(dto.homecellId) : undefined,
        baptismDate: dto.baptismDate ? new Date(dto.baptismDate) : undefined,
        bio:
          dto.bio !== undefined
            ? {
                upsert: {
                  create: { bio: dto.bio },
                  update: { bio: dto.bio },
                },
              }
            : undefined,
      },
      include: {
        bio: true,
        homecell: true,
      },
    });

    await this.auditService.log({
      action: 'MEMBER_UPDATED',
      entity: 'Member',
      entityId: id,
      before,
      after,
    });

    this.logger.log(`UPDATE_MEMBER_SUCCESS: ${id}`);

    return {
      success: true,
      data: after,
      meta: {},
    };
  }

  // -----------------------------
  // DELETE
  // -----------------------------
  async remove(id: string) {
    const memberId = toBigInt(id);

    this.logger.warn(`DELETE_MEMBER_STARTED: ${id}`);

    const before = await this.prisma.member.findFirst({
      where: { id: memberId },
    });

    if (!before) throw new NotFoundException('Member not found');

    await this.prisma.member.delete({
      where: { id: memberId },
    });

    await this.auditService.log({
      action: 'MEMBER_DELETED',
      entity: 'Member',
      entityId: id,
      before,
    });

    this.logger.warn(`DELETE_MEMBER_SUCCESS: ${id}`);

    return {
      success: true,
      data: {},
      meta: {},
    };
  }

  // -----------------------------
  // ASSIGN MINISTRY
  // -----------------------------
  async assignMinistry(memberId: string, ministryId: string) {
    this.logger.log(
      `ASSIGN_MINISTRY_STARTED: member=${memberId} ministry=${ministryId}`,
    );

    await this.prisma.memberMinistry.create({
      data: {
        memberId: toBigInt(memberId),
        ministryId: toBigInt(ministryId),
      },
    });

    await this.auditService.log({
      action: 'MEMBER_ASSIGNED_MINISTRY',
      entity: 'Member',
      entityId: memberId,
      after: { ministryId },
    });

    this.logger.log(
      `ASSIGN_MINISTRY_SUCCESS: member=${memberId} ministry=${ministryId}`,
    );

    return {
      success: true,
      message: 'Member assigned to ministry',
      meta: {},
    };
  }

  // -----------------------------
  // REMOVE MINISTRY
  // -----------------------------
  async removeMinistry(memberId: string, ministryId: string) {
    this.logger.warn(
      `REMOVE_MINISTRY_STARTED: member=${memberId} ministry=${ministryId}`,
    );

    await this.prisma.memberMinistry.delete({
      where: {
        memberId_ministryId: {
          memberId: toBigInt(memberId),
          ministryId: toBigInt(ministryId),
        },
      },
    });

    await this.auditService.log({
      action: 'MEMBER_REMOVED_MINISTRY',
      entity: 'Member',
      entityId: memberId,
      after: { ministryId },
    });

    this.logger.warn(
      `REMOVE_MINISTRY_SUCCESS: member=${memberId} ministry=${ministryId}`,
    );

    return {
      success: true,
      message: 'Member removed from ministry',
      meta: {},
    };
  }
}
