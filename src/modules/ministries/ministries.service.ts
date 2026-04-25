import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMinistryDto } from './dto/create-ministry.dto';
import { UpdateMinistryDto } from './dto/update-ministry.dto';
import { QueryMinistryDto } from './dto/query-ministry.dto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { Audit } from 'src/common/decorators/audit.decorator';

@Injectable()
export class MinistriesService {
  private readonly logger = new Logger(MinistriesService.name);

  constructor(private prisma: PrismaService) {}

  // -----------------------------
  // CREATE
  // -----------------------------
  @Audit({
    action: 'MINISTRY_CREATED',
    entity: 'Ministry',
  })
  async create(dto: CreateMinistryDto) {
    this.logger.log(`Creating ministry: ${dto.name}`);

    const ministry = await this.prisma.ministry.create({
      data: {
        name: dto.name,
        description: dto.description,
        leaderId: dto.leaderId ? toBigInt(dto.leaderId) : null,
        overseerId: dto.overseerId ? toBigInt(dto.overseerId) : null,
      },
    });

    return {
      success: true,
      data: ministry,
      meta: {},
    };
  }

  // -----------------------------
  // FIND ALL (NO AUDIT)
  // -----------------------------
  async findAll(query: QueryMinistryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    this.logger.log(`Fetching ministries (page=${page}, limit=${limit})`);

    const where: any = { deletedAt: null };

    if (query.search) {
      where.name = {
        contains: query.search,
        mode: 'insensitive',
      };
    }

    if (query.leaderId) where.leaderId = BigInt(query.leaderId);
    if (query.overseerId) where.overseerId = BigInt(query.overseerId);

    const [data, total] = await Promise.all([
      this.prisma.ministry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          leader: { include: { bio: true } },
          overseer: { include: { bio: true } },
        },
      }),
      this.prisma.ministry.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // -----------------------------
  // FIND ONE (NO AUDIT)
  // -----------------------------
  async findOne(id: string) {
    this.logger.log(`Fetching ministry: ${id}`);

    const ministry = await this.prisma.ministry.findFirst({
      where: {
        id: toBigInt(id),
        deletedAt: null,
      },
      include: {
        leader: { include: { bio: true } },
        overseer: { include: { bio: true } },

        members: {
          where: { member: { deletedAt: null } },
          include: { member: true },
        },

        events: {
          include: { event: true },
          where: {
            event: {
              deletedAt: null,
              startTime: { gte: new Date() },
            },
          },
          orderBy: {
            event: { startTime: 'asc' },
          },
          take: 5,
        },
      },
    });

    if (!ministry) {
      this.logger.warn(`Ministry not found: ${id}`);
      throw new NotFoundException('Ministry not found');
    }

    const flattenedEvents = ministry.events.map((e) => e.event);

    return {
      success: true,
      data: {
        ...ministry,
        events: flattenedEvents,
      },
      meta: {},
    };
  }

  // -----------------------------
  // UPDATE
  // -----------------------------
  @Audit({
    action: 'MINISTRY_UPDATED',
    entity: 'Ministry',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async update(id: string, dto: UpdateMinistryDto) {
    const ministry = await this.prisma.ministry.update({
      where: { id: toBigInt(id) },
      data: {
        name: dto.name,
        description: dto.description,
        leaderId: dto.leaderId ? toBigInt(dto.leaderId) : null,
        overseerId: dto.overseerId ? toBigInt(dto.overseerId) : null,
      },
    });

    return {
      success: true,
      data: ministry,
      meta: {},
    };
  }

  // -----------------------------
  // DELETE
  // -----------------------------
  @Audit({
    action: 'MINISTRY_DELETED',
    entity: 'Ministry',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async remove(id: string) {
    await this.prisma.ministry.delete({
      where: { id: toBigInt(id) },
    });

    return {
      success: true,
      data: {},
      meta: {},
    };
  }

  // -----------------------------
  // ASSIGN MEMBER
  // -----------------------------
  @Audit({
    action: 'MINISTRY_MEMBER_ASSIGNED',
    entity: 'MemberMinistry',
  })
  async assignMember(memberId: string, ministryId: string) {
    this.logger.log(`Assigning member ${memberId} to ministry ${ministryId}`);

    const member = await this.prisma.member.findFirst({
      where: { id: toBigInt(memberId) },
    });

    if (!member) {
      throw new NotFoundException(`Member with id ${memberId} not found`);
    }

    const ministry = await this.prisma.ministry.findFirst({
      where: { id: toBigInt(ministryId) },
    });

    if (!ministry) {
      throw new NotFoundException(`Ministry with id ${ministryId} not found`);
    }

    await this.prisma.memberMinistry.create({
      data: {
        memberId: toBigInt(memberId),
        ministryId: toBigInt(ministryId),
      },
    });

    return {
      success: true,
      message: 'Member assigned to ministry',
      meta: {},
    };
  }

  // -----------------------------
  // REMOVE MEMBER
  // -----------------------------
  @Audit({
    action: 'MINISTRY_MEMBER_REMOVED',
    entity: 'MemberMinistry',
    idParamIndex: 0,
  })
  async removeMember(memberId: string, ministryId: string) {
    this.logger.log(`Removing member ${memberId} from ministry ${ministryId}`);

    await this.prisma.memberMinistry.delete({
      where: {
        memberId_ministryId: {
          memberId: toBigInt(memberId),
          ministryId: toBigInt(ministryId),
        },
      },
    });

    return {
      success: true,
      message: `Member removed from ministry`,
      meta: {},
    };
  }

  // -----------------------------
  // GET MEMBERS (NO AUDIT)
  // -----------------------------
  async getMembers(ministryId: string) {
    this.logger.log(`Fetching members for ministry: ${ministryId}`);

    const members = await this.prisma.memberMinistry.findMany({
      where: {
        ministryId: toBigInt(ministryId),
        member: { deletedAt: null },
      },
      include: {
        member: true,
      },
    });

    return {
      success: true,
      data: members,
      meta: {},
    };
  }
}
