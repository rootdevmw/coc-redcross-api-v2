import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMinistryDto } from './dto/create-ministry.dto';
import { UpdateMinistryDto } from './dto/update-ministry.dto';
import { QueryMinistryDto } from './dto/query-ministry.dto';

@Injectable()
export class MinistriesService {
  private readonly logger = new Logger(MinistriesService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateMinistryDto) {
    this.logger.log(`Creating ministry: ${dto.name}`);

    const ministry = await this.prisma.ministry.create({
      data: dto,
    });

    this.logger.log(`Ministry created: ${ministry.name}`);

    return {
      success: true,
      data: ministry,
      meta: {},
    };
  }

  async findAll(query: QueryMinistryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    this.logger.log(`Fetching ministries (page=${page}, limit=${limit})`);

    const where: any = {};

    if (query.search) {
      where.name = {
        contains: query.search,
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.ministry.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          leader: true,
        },
      }),
      this.prisma.ministry.count({ where }),
    ]);

    this.logger.log(`Fetched ${data.length} ministries`);

    return {
      success: true,
      data,
      meta: { page, limit, total },
    };
  }

  async findOne(id: string) {
    const ministry = await this.prisma.ministry.findUnique({
      where: { id },
      include: {
        leader: true,
        members: {
          include: {
            member: true,
          },
        },
      },
    });

    if (!ministry) {
      this.logger.warn(`Ministry not found: ${id}`);
      throw new NotFoundException('Ministry not found');
    }
    this.logger.log(`Fetching ministry: ${ministry.name}`);

    return {
      success: true,
      data: ministry,
      meta: {},
    };
  }

  async update(id: string, dto: UpdateMinistryDto) {
    const ministry = await this.prisma.ministry.update({
      where: { id },
      data: dto,
    });
    this.logger.log(`Updating ministry: ${ministry.name}`);

    return {
      success: true,
      data: ministry,
      meta: {},
    };
  }

  async getMembers(ministryId: string) {
    this.logger.log(`Fetching members for ministry: ${ministryId}`);

    const members = await this.prisma.memberMinistry.findMany({
      where: { ministryId },
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

  async assignMember(memberId: string, ministryId: string) {
    this.logger.log(`Assigning member ${memberId} to ministry ${ministryId}`);

    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      this.logger.warn(`Member not found: ${memberId}`);
      throw new NotFoundException(`Member with id ${memberId} not found`);
    }

    const ministry = await this.prisma.ministry.findUnique({
      where: { id: ministryId },
    });

    if (!ministry) {
      this.logger.warn(`Ministry not found: ${ministryId}`);
      throw new NotFoundException(`Ministry with id ${ministryId} not found`);
    }

    await this.prisma.memberMinistry.create({
      data: {
        memberId,
        ministryId,
      },
    });
    this.logger.log(
      `Member ${member.firstName} ${member.lastName} assigned to ministry ${ministry.name} success`,
    );
    return {
      success: true,
      message: 'Member assigned to ministry',
      meta: {},
    };
  }

  async removeMember(memberId: string, ministryId: string) {
    this.logger.log(`Removing member ${memberId} from ministry ${ministryId}`);

    await this.prisma.memberMinistry.delete({
      where: {
        memberId_ministryId: {
          memberId,
          ministryId,
        },
      },
    });

    return {
      success: true,
      message: `Member with id ${memberId} removed from ministry ${ministryId}`,
      meta: {},
    };
  }
}
