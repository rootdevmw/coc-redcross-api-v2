import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHomecellDto } from './dto/create-homecell.dto';
import { UpdateHomecellDto } from './dto/update-homecell.dto';

@Injectable()
export class HomecellsService {
  private readonly logger = new Logger(HomecellsService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateHomecellDto) {
    this.logger.log('Creating homecell');

    const homecell = await this.prisma.homecell.create({
      data: dto,
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
        members: true,
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

    const homecell = await this.prisma.homecell.findUnique({
      where: { id },
      include: {
        leader: true,
        members: true,
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
      where: { id },
      data: dto,
    });

    this.logger.log(`Updated homecell ${homecell.id}`);

    return {
      success: true,
      data: homecell,
      meta: {},
    };
  }

  /**
   * A member can belong to ONLY ONE homecell
   * → This overrides previous assignment
   */
  async assignMember(homecellId: string, memberId: string) {
    // Ensure homecell exists
    const homecell = await this.prisma.homecell.findUnique({
      where: { id: homecellId },
    });

    if (!homecell) throw new NotFoundException('Homecell not found');

    // Ensure member exists
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
    });
    this.logger.log(
      `Assigning member ${member?.firstName} ${member?.lastName} to homecell ${homecell.name}`,
    );

    if (!member) throw new NotFoundException('Member not found');

    //KEY LOGIC: override previous homecell
    await this.prisma.member.update({
      where: { id: memberId },
      data: {
        homecellId: homecellId,
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
      where: { homecellId },
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
}
