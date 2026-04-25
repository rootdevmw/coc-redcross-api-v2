import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ProgramTemplatesService {
  private readonly logger = new Logger(ProgramTemplatesService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // -----------------------------
  // CREATE TEMPLATE
  // -----------------------------
  async create(dto: any) {
    this.logger.log(`Creating template: ${dto.name}`);

    const template = await this.prisma.programTemplate.create({
      data: {
        name: dto.name,
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
      action: 'PROGRAM_TEMPLATE_CREATED',
      entity: 'ProgramTemplate',
      entityId: template.id.toString(),
      after: template,
    });

    return { success: true, data: template, meta: {} };
  }

  // -----------------------------
  // GET ALL (NO AUDIT)
  // -----------------------------
  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const where: any = { deletedAt: null };

    if (query.homecellId) {
      where.homecellId = toBigIntOptional(query.homecellId);
    }

    const [data, total] = await Promise.all([
      this.prisma.programTemplate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },

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

      this.prisma.programTemplate.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: { page, limit, total },
    };
  }

  // -----------------------------
  // GET ONE (NO AUDIT)
  // -----------------------------
  async findOne(id: string) {
    const template = await this.prisma.programTemplate.findFirst({
      where: {
        id: toBigIntOptional(id),
        deletedAt: null,
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

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return { success: true, data: template, meta: {} };
  }

  // -----------------------------
  // UPDATE TEMPLATE
  // -----------------------------
  async update(id: string, dto: any) {
    this.logger.log(`Updating template ${id}`);

    const templateId = toBigIntOptional(id);

    const before = await this.prisma.programTemplate.findFirst({
      where: { id: templateId },
      include: {
        items: true,
      },
    });

    if (!before) {
      throw new NotFoundException('Template not found');
    }

    if (dto.items) {
      await this.prisma.programTemplateItem.deleteMany({
        where: { templateId },
      });
    }

    const after = await this.prisma.programTemplate.update({
      where: { id: templateId },
      data: {
        name: dto.name,
        typeId: dto.typeId,
        homecellId: dto.homecellId,

        items: dto.items
          ? {
              create: dto.items.map((item: any) => ({
                title: item.title,
                description: item.description,
                time: item.time,
                sequence: item.sequence,
                responsibleId: item.responsibleId,
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
      action: 'PROGRAM_TEMPLATE_UPDATED',
      entity: 'ProgramTemplate',
      entityId: id,
      before,
      after,
    });

    return { success: true, data: after, meta: {} };
  }

  // -----------------------------
  // DELETE TEMPLATE
  // -----------------------------
  async remove(id: string) {
    this.logger.log(`Deleting template ${id}`);

    const templateId = toBigIntOptional(id);

    const before = await this.prisma.programTemplate.findFirst({
      where: { id: templateId },
    });

    if (!before) {
      throw new NotFoundException('Template not found');
    }

    await this.prisma.programTemplate.update({
      where: { id: templateId },
      data: { deletedAt: new Date() },
    });

    await this.auditService.log({
      action: 'PROGRAM_TEMPLATE_DELETED',
      entity: 'ProgramTemplate',
      entityId: id,
      before,
    });

    return { success: true, data: {}, meta: {} };
  }
}
