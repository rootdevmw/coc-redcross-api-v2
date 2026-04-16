import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHomecellDto } from './dto/create-homecell.dto';
import { UpdateHomecellDto } from './dto/update-homecell.dto';
import { toBigInt } from 'src/common/utils/to-bigint';

@Injectable()
export class HomecellsService {
  private readonly logger = new Logger(HomecellsService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateHomecellDto) {
    this.logger.log('Creating homecell');

    const homecell = await this.prisma.homecell.create({
      data: {
        name: dto.name,
        location: dto.location,
        leaderId: dto.leaderId ? toBigInt(dto.leaderId) : undefined,
        overseerId: dto.overseerId ? toBigInt(dto.overseerId) : undefined,
      },
    });

    this.logger.log(`Created homecell ${homecell.name}`);

    return {
      success: true,
      data: homecell,
      meta: {},
    };
  }

  async findAll() {
    this.logger.log('Fetching homecells');

    const data = await this.prisma.homecell.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        leader: true,
        members: {
          where: { deletedAt: null },
        },
        overseer: true,
      },
    });

    this.logger.log(`Fetched ${data.length} homecells`);

    return {
      success: true,
      data,
      meta: {},
    };
  }

  async findOne(id: string) {
    this.logger.log(`Fetching homecell ${id}`);

    const homecell = await this.prisma.homecell.findFirst({
      where: { id: toBigInt(id) },
      include: {
        leader: true,
        members: {
          where: { deletedAt: null },
        },
        overseer: true,
      },
    });

    if (!homecell) throw new NotFoundException('Homecell not found');

    this.logger.log(`Fetched homecell ${id}`);

    return {
      success: true,
      data: homecell,
      meta: {},
    };
  }

  async update(id: string, dto: UpdateHomecellDto) {
    this.logger.log(`Updating homecell ${id}`);

    const homecell = await this.prisma.homecell.update({
      where: { id: toBigInt(id) },
      data: {
        name: dto.name,
        location: dto.location,
        leaderId: dto.leaderId ? toBigInt(dto.leaderId) : undefined,
        overseerId: dto.overseerId ? toBigInt(dto.overseerId) : undefined,
      },
    });

    this.logger.log(`Updated homecell ${homecell.id}`);

    return {
      success: true,
      data: homecell,
      meta: {},
    };
  }

  async remove(id: string) {
    await this.prisma.homecell.delete({
      where: { id: toBigInt(id) },
    });

    return {
      success: true,
      data: {},
      meta: {},
    };
  }

  /**
   * A member can belong to ONLY ONE homecell
   * → This overrides previous assignment
   */
  async assignMember(homecellId: string, memberId: string) {
    // Ensure homecell exists
    const homecell = await this.prisma.homecell.findFirst({
      where: { id: toBigInt(homecellId) },
    });

    if (!homecell) throw new NotFoundException('Homecell not found');

    // Ensure member exists
    const member = await this.prisma.member.findFirst({
      where: { id: toBigInt(memberId) },
    });
    this.logger.log(
      `Assigning member ${member?.firstName} ${member?.lastName} to homecell ${homecell.name}`,
    );

    if (!member) throw new NotFoundException('Member not found');

    //KEY LOGIC: override previous homecell
    await this.prisma.member.update({
      where: { id: toBigInt(memberId) },
      data: {
        homecellId: toBigInt(homecellId),
      },
    });

    this.logger.log('member assigned successfully');

    return {
      success: true,
      message: 'Member assigned to homecell ' + homecell.name,
      meta: {},
    };
  }

  async getMembers(homecellId: string) {
    this.logger.log(`Fetching members for homecell ${homecellId}`);

    const members = await this.prisma.member.findMany({
      where: { homecellId: toBigInt(homecellId) },
      include: {
        ministries: {
          include: {
            ministry: true,
          },
        },
      },
    });

    this.logger.log(
      `Fetched ${members.length} members for homecell ${homecellId}`,
    );

    return {
      success: true,
      data: members,
      meta: {},
    };
  }

  async removeMember(homecellId: string, memberId: string) {
    this.logger.log(`Removing member ${memberId} from homecell ${homecellId}`);

    // Ensure homecell exists
    const homecell = await this.prisma.homecell.findFirst({
      where: { id: toBigInt(homecellId) },
    });

    if (!homecell)
      throw new NotFoundException('Homecell with ID ${homecellId} not found');

    // Ensure member exists and is in this homecell
    const member = await this.prisma.member.findFirst({
      where: { id: toBigInt(memberId), homecellId: toBigInt(homecellId) },
    });

    if (!member)
      throw new NotFoundException(
        'Member with ID ${memberId} not found in this homecell',
      );

    // Remove by setting homecellId to null
    await this.prisma.member.update({
      where: { id: toBigInt(memberId) },
      data: { homecellId: null },
    });

    this.logger.log(
      `Removed member ${member.firstName} ${member.lastName} from homecell ${homecell.name}`,
    );

    return {
      success: true,
      message: 'Member removed from homecell',
      meta: {},
    };
  }
}
