import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateHomecellDto } from './dto/create-homecell.dto';
import { UpdateHomecellDto } from './dto/update-homecell.dto';
import { toBigInt } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class HomecellsService {
  private readonly logger = new Logger(HomecellsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateHomecellDto) {
    this.logger.log('CREATE_HOMECELL_STARTED');

    const homecell = await this.prisma.homecell.create({
      data: {
        name: dto.name,
        location: dto.location,
        leaderId: dto.leaderId ? toBigInt(dto.leaderId) : undefined,
        overseerId: dto.overseerId ? toBigInt(dto.overseerId) : undefined,
      },
    });

    await this.auditService.log({
      action: 'HOMECELL_CREATED',
      entity: 'Homecell',
      entityId: homecell.id.toString(),
      after: homecell,
    });

    this.logger.log(`CREATE_HOMECELL_SUCCESS: ${homecell.name}`);

    return {
      success: true,
      data: homecell,
      meta: {},
    };
  }

  async findAll() {
    this.logger.log('Fetching homecells');
    const now = new Date();
    const data = await this.prisma.homecell.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        leader: {
          include: {
            bio: true,
          },
        },
        members: {
          where: { deletedAt: null },
        },
        programs: {
          where: {
            deletedAt: null,
            date: {
              gte: now,
            },
          },
        },
        overseer: {
          include: {
            bio: true,
          },
        },
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
    const now = new Date();

    const homecell = await this.prisma.homecell.findFirst({
      where: { id: toBigInt(id) },
      include: {
        leader: {
          include: {
            bio: true,
          },
        },
        members: {
          where: { deletedAt: null },
        },
        programs: {
          where: {
            deletedAt: null,
            date: {
              gte: now,
            },
          },
        },
        overseer: {
          include: { bio: true },
        },
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
    this.logger.log(`UPDATE_HOMECELL_STARTED: ${id}`);

    const homecellId = toBigInt(id);

    const before = await this.prisma.homecell.findFirst({
      where: { id: homecellId },
    });

    if (!before) throw new NotFoundException('Homecell not found');

    const after = await this.prisma.homecell.update({
      where: { id: homecellId },
      data: {
        name: dto.name,
        location: dto.location,
        leaderId: dto.leaderId ? toBigInt(dto.leaderId) : undefined,
        overseerId: dto.overseerId ? toBigInt(dto.overseerId) : undefined,
      },
    });

    await this.auditService.log({
      action: 'HOMECELL_UPDATED',
      entity: 'Homecell',
      entityId: id,
      before,
      after,
    });

    this.logger.log(`UPDATE_HOMECELL_SUCCESS: ${id}`);

    return {
      success: true,
      data: after,
      meta: {},
    };
  }

  async remove(id: string) {
    const homecellId = toBigInt(id);

    this.logger.warn(`DELETE_HOMECELL_STARTED: ${id}`);

    const before = await this.prisma.homecell.findFirst({
      where: { id: homecellId },
    });

    if (!before) throw new NotFoundException('Homecell not found');

    await this.prisma.homecell.delete({
      where: { id: homecellId },
    });

    await this.auditService.log({
      action: 'HOMECELL_DELETED',
      entity: 'Homecell',
      entityId: id,
      before,
    });

    this.logger.warn(`DELETE_HOMECELL_SUCCESS: ${id}`);

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
    const homecell = await this.prisma.homecell.findFirst({
      where: { id: toBigInt(homecellId) },
    });

    if (!homecell) throw new NotFoundException('Homecell not found');

    const member = await this.prisma.member.findFirst({
      where: { id: toBigInt(memberId) },
    });

    if (!member) throw new NotFoundException('Member not found');

    const before = await this.prisma.member.findFirst({
      where: { id: toBigInt(memberId) },
    });

    this.logger.log(
      `ASSIGN_MEMBER → ${member.firstName} ${member.lastName} → ${homecell.name}`,
    );

    await this.prisma.member.update({
      where: { id: toBigInt(memberId) },
      data: {
        homecellId: toBigInt(homecellId),
      },
    });

    const after = await this.prisma.member.findFirst({
      where: { id: toBigInt(memberId) },
    });

    await this.auditService.log({
      action: 'MEMBER_ASSIGNED_TO_HOMECELL',
      entity: 'Member',
      entityId: memberId,
      before,
      after,
    });

    this.logger.log('MEMBER_ASSIGNMENT_SUCCESS');

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
    this.logger.log(`REMOVE_MEMBER_STARTED: ${memberId}`);

    const homecell = await this.prisma.homecell.findFirst({
      where: { id: toBigInt(homecellId) },
    });

    if (!homecell) throw new NotFoundException(`Homecell not found`);

    const member = await this.prisma.member.findFirst({
      where: {
        id: toBigInt(memberId),
        homecellId: toBigInt(homecellId),
      },
    });

    if (!member)
      throw new NotFoundException(`Member not found in this homecell`);

    const before = member;

    await this.prisma.member.update({
      where: { id: toBigInt(memberId) },
      data: { homecellId: null },
    });

    const after = await this.prisma.member.findFirst({
      where: { id: toBigInt(memberId) },
    });

    await this.auditService.log({
      action: 'MEMBER_REMOVED_FROM_HOMECELL',
      entity: 'Member',
      entityId: memberId,
      before,
      after,
    });

    this.logger.log(
      `REMOVE_MEMBER_SUCCESS: ${member.firstName} ${member.lastName}`,
    );

    return {
      success: true,
      message: 'Member removed from homecell',
      meta: {},
    };
  }
}
