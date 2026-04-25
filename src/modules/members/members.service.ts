import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMemberDto } from './dto/query-member.dto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { Audit } from 'src/common/decorators/audit.decorator';

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(private prisma: PrismaService) {}

  // -----------------------------
  // CREATE
  // -----------------------------
  @Audit({
    action: 'MEMBER_CREATED',
    entity: 'Member',
  })
  async create(dto: CreateMemberDto) {
    this.logger.log('Creating member');

    const member = await this.prisma.member.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        prefix: dto.prefix,
        phone: dto.phone,
        status: dto.status,
        location: dto.location,
        homecell: dto.homecellId
          ? {
              connect: {
                id: toBigInt(dto.homecellId),
              },
            }
          : undefined,
        baptized: dto.isBaptized,
        baptismDate: dto.baptismDate ? new Date(dto.baptismDate) : null,

        bio: dto.bio?.trim()
          ? {
              create: {
                bio: dto.bio,
              },
            }
          : undefined,
      },
      include: {
        bio: true,
        homecell: true,
      },
    });

    this.logger.log(`Created member ${member.id}`);

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

    this.logger.log(`Fetching members page=${page} limit=${limit}`);

    const where: any = {};

    if (query.status && query.status !== '') {
      where.status = query.status;
    }

    if (query.homecellId) where.homecellId = query.homecellId;

    if (query.prefix && query.prefix !== '') {
      where.prefix = query.prefix;
    }

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

    this.logger.log(`Fetched ${data.length} members out of ${total}`);

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
    this.logger.log(`Fetching member ${id}`);

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

    this.logger.log(`Fetched member ${id}`);

    return {
      success: true,
      data: member,
    };
  }

  // -----------------------------
  // UPDATE
  // -----------------------------
  @Audit({
    action: 'MEMBER_UPDATED',
    entity: 'Member',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async update(id: string, dto: UpdateMemberDto) {
    this.logger.log(`Updating member ${id}`);

    const member = await this.prisma.member.update({
      where: { id: toBigInt(id) },

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

    this.logger.log(`Updated member ${member.id}`);

    return {
      success: true,
      data: member,
      meta: {},
    };
  }

  // -----------------------------
  // DELETE
  // -----------------------------
  @Audit({
    action: 'MEMBER_DELETED',
    entity: 'Member',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async remove(id: string) {
    await this.prisma.member.delete({
      where: { id: toBigInt(id) },
    });

    return {
      success: true,
      data: {},
      meta: {},
    };
  }

  // -----------------------------
  // ASSIGN MINISTRY
  // -----------------------------
  @Audit({
    action: 'MEMBER_ASSIGNED_MINISTRY',
    entity: 'Member',
    idParamIndex: 0,
  })
  async assignMinistry(memberId: string, ministryId: string) {
    this.logger.log(`Assigning member ${memberId} to ministry ${ministryId}`);

    await this.prisma.memberMinistry.create({
      data: {
        memberId: toBigInt(memberId),
        ministryId: toBigInt(ministryId),
      },
    });

    this.logger.log(`Assigned member ${memberId} to ministry ${ministryId}`);

    return {
      success: true,
      message: 'Member assigned to ministry',
      meta: {},
    };
  }

  // -----------------------------
  // REMOVE MINISTRY
  // -----------------------------
  @Audit({
    action: 'MEMBER_REMOVED_MINISTRY',
    entity: 'Member',
    idParamIndex: 0,
  })
  async removeMinistry(memberId: string, ministryId: string) {
    this.logger.log(`Removing member ${memberId} from ministry ${ministryId}`);

    await this.prisma.memberMinistry.delete({
      where: {
        memberId_ministryId: {
          memberId: toBigInt(memberId),
          ministryId: toBigInt(ministryId),
        },
      },
    });

    this.logger.log(`Removed member ${memberId} from ministry ${ministryId}`);

    return {
      success: true,
      message: 'Member removed from ministry',
      meta: {},
    };
  }
}
