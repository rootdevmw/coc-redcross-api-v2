import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ProgramsService {
  private readonly logger = new Logger(ProgramsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // -----------------------------
  // CREATE PROGRAM
  // -----------------------------
  async create(dto: any) {
    this.logger.log(`Creating program for date ${dto.date}`);

    const program = await this.prisma.program.create({
      data: {
        date: new Date(dto.date),
        location: dto.location || undefined,
        typeId: dto.typeId,
        homecellId: dto.homecellId,
        items: {
          create: dto.items.map((item: any) => ({
            title: item.title,
            description: item.description,
            time: item.time,
            sequence: item.sequence,
            responsibleId: item.responsibleId,
          })),
        },
      },
      include: {
        type: true,
        homecell: true,
        items: {
          include: { responsible: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    await this.auditService.log({
      action: 'PROGRAM_CREATED',
      entity: 'Program',
      entityId: program.id.toString(),
      after: program,
    });

    return { success: true, data: program, meta: {} };
  }

  // -----------------------------
  // CREATE FROM TEMPLATE
  // -----------------------------
  async createFromTemplate(dto: any) {
    this.logger.log(`Creating program from template ${dto.templateId}`);

    const template = await this.prisma.programTemplate.findFirst({
      where: {
        id: toBigIntOptional(dto.templateId),
        deletedAt: null,
      },
      include: {
        items: {
          where: { deletedAt: null },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    const program = await this.prisma.program.create({
      data: {
        date: new Date(dto.date),
        location: dto.location || undefined,
        typeId: template.typeId,
        homecellId: dto.homecellId ?? template.homecellId ?? null,
        items: {
          create: template.items.map((item) => ({
            title: item.title,
            description: item.description,
            time: item.time,
            sequence: item.sequence,
            responsibleId: item.responsibleId,
          })),
        },
      },
      include: {
        type: true,
        homecell: true,
        items: {
          include: { responsible: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    await this.auditService.log({
      action: 'PROGRAM_CREATED_FROM_TEMPLATE',
      entity: 'Program',
      entityId: program.id.toString(),
      after: program,
    });

    return { success: true, data: program, meta: {} };
  }

  // -----------------------------
  // FIND ALL (NO AUDIT)
  // -----------------------------
  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const where: any = { deletedAt: null };

    if (query.homecellId) where.homecellId = query.homecellId;
    if (query.typeId) where.typeId = query.typeId;

    if (query.date) {
      const start = new Date(query.date);
      const end = new Date(query.date);
      end.setHours(23, 59, 59, 999);
      where.date = { gte: start, lte: end };
    } else if (query.fromDate) {
      where.date = { gte: new Date(query.fromDate) };
    }

    const orderDir: 'asc' | 'desc' = query.fromDate ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.program.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { date: orderDir },
        include: {
          type: true,
          homecell: true,
          items: {
            where: { deletedAt: null },
            include: { responsible: true },
            orderBy: { sequence: 'asc' },
          },
        },
      }),
      this.prisma.program.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // -----------------------------
  // FIND ONE (NO AUDIT)
  // -----------------------------
  async findOne(id: string) {
    const program = await this.prisma.program.findFirst({
      where: { id: toBigIntOptional(id) },
      include: {
        type: true,
        homecell: true,
        items: {
          where: { deletedAt: null },
          include: { responsible: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!program) throw new NotFoundException('Program not found');

    return { success: true, data: program, meta: {} };
  }

  // -----------------------------
  // UPDATE PROGRAM
  // -----------------------------
  async update(id: string, dto: any) {
    this.logger.log(`Updating program ${id}`);

    const programId = toBigIntOptional(id);

    const before = await this.prisma.program.findFirst({
      where: { id: programId },
      include: { items: true },
    });

    if (!before) throw new NotFoundException('Program not found');

    if (dto.items) {
      await this.prisma.programItem.deleteMany({
        where: { programId },
      });
    }

    const after = await this.prisma.program.update({
      where: { id: programId },
      data: {
        date: dto.date ? new Date(dto.date) : undefined,
        location: dto.location || undefined,
        typeId: dto.typeId || undefined,
        homecellId: dto.homecellId || undefined,
        items: dto.items
          ? {
              create: dto.items.map((item: any) => ({
                title: item.title,
                description: item.description,
                time: item.time,
                sequence: item.sequence,
                responsibleId: item.responsibleId || undefined,
              })),
            }
          : undefined,
      },
      include: {
        type: true,
        homecell: true,
        items: {
          where: { deletedAt: null },
          include: { responsible: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    await this.auditService.log({
      action: 'PROGRAM_UPDATED',
      entity: 'Program',
      entityId: id,
      before,
      after,
    });

    return { success: true, data: after, meta: {} };
  }

  // -----------------------------
  // DELETE PROGRAM
  // -----------------------------
  async remove(id: string) {
    this.logger.warn(`Deleting program ${id}`);

    const programId = toBigIntOptional(id);

    const before = await this.prisma.program.findFirst({
      where: { id: programId },
    });

    if (!before) throw new NotFoundException('Program not found');

    await this.prisma.program.delete({
      where: { id: programId },
    });

    await this.auditService.log({
      action: 'PROGRAM_DELETED',
      entity: 'Program',
      entityId: id,
      before,
    });

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // PROGRAM TYPES
  // -----------------------------
  async createType(name: string) {
    const type = await this.prisma.programType.create({
      data: { name },
    });

    return { success: true, data: type, meta: {} };
  }

  async getTypes() {
    const types = await this.prisma.programType.findMany({
      orderBy: { name: 'asc' },
    });

    return { success: true, data: types, meta: {} };
  }
}
