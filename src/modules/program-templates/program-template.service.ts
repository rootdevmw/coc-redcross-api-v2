import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import { Audit } from 'src/common/decorators/audit.decorator';

@Injectable()
export class ProgramTemplatesService {
  private readonly logger = new Logger(ProgramTemplatesService.name);

  constructor(private prisma: PrismaService) {}

  // -----------------------------
  // CREATE TEMPLATE
  // -----------------------------
  @Audit({
    action: 'PROGRAM_TEMPLATE_CREATED',
    entity: 'ProgramTemplate',
  })
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

    return { success: true, data: template, meta: {} };
  }

  // -----------------------------
  // GET ALL (NO AUDIT)
  // -----------------------------
  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const where: any = {
      deletedAt: null,
    };

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
  @Audit({
    action: 'PROGRAM_TEMPLATE_UPDATED',
    entity: 'ProgramTemplate',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async update(id: string, dto: any) {
    this.logger.log(`Updating template ${id}`);

    const templateId = toBigIntOptional(id);

    if (dto.items) {
      await this.prisma.programTemplateItem.deleteMany({
        where: { templateId },
      });
    }

    const template = await this.prisma.programTemplate.update({
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

    return { success: true, data: template, meta: {} };
  }

  // -----------------------------
  // DELETE TEMPLATE
  // -----------------------------
  @Audit({
    action: 'PROGRAM_TEMPLATE_DELETED',
    entity: 'ProgramTemplate',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async remove(id: string) {
    await this.prisma.programTemplate.update({
      where: { id: toBigIntOptional(id) },
      data: { deletedAt: new Date() },
    });

    return { success: true, data: {}, meta: {} };
  }
}
