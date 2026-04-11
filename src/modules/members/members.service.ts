import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { QueryMemberDto } from './dto/query-member.dto';

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateMemberDto) {
    this.logger.log('Creating member');

    const member = await this.prisma.member.create({
      data: {
        ...dto,
        baptismDate: dto.baptismDate ? new Date(dto.baptismDate) : null,
      },
    });

    this.logger.log(`Created member ${member.id}`);

    return {
      success: true,
      data: member,
      meta: {},
    };
  }

  async findAll(query: QueryMemberDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;
    this.logger.log(`Fetching members page=${page} limit=${limit}`);

    const where: any = {};

    if (query.status) where.status = query.status;

    if (query.homecellId) where.homecellId = query.homecellId;

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

  async findOne(id: string) {
    this.logger.log(`Fetching member ${id}`);

    const member = await this.prisma.member.findUnique({
      where: { id },
      include: {
        homecell: true,
        ministries: {
          include: { ministry: true },
        },
      },
    });

    this.logger.log(`Fetched member ${id}`);

    return {
      success: true,
      data: member,
    };
  }

  async update(id: string, dto: UpdateMemberDto) {
    this.logger.log(`Updating member ${id}`);

    const member = await this.prisma.member.update({
      where: { id },
      data: {
        ...dto,
        baptismDate: dto.baptismDate ? new Date(dto.baptismDate) : undefined,
      },
    });

    this.logger.log(`Updated member ${member.id}`);

    return {
      success: true,
      data: member,
      meta: {},
    };
  }

  async assignMinistry(memberId: string, ministryId: string) {
    this.logger.log(`Assigning member ${memberId} to ministry ${ministryId}`);

    await this.prisma.memberMinistry.create({
      data: {
        memberId,
        ministryId,
      },
    });

    this.logger.log(`Assigned member ${memberId} to ministry ${ministryId}`);

    return {
      success: true,
      message: 'Member assigned to ministry',
      meta: {},
    };
  }

  async removeMinistry(memberId: string, ministryId: string) {
    this.logger.log(`Removing member ${memberId} from ministry ${ministryId}`);

    await this.prisma.memberMinistry.delete({
      where: {
        memberId_ministryId: {
          memberId,
          ministryId,
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
