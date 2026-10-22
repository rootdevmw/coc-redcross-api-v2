import { saveProgramEditor } from '../../common/utils/program-editor';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';
import { templateListWhere } from '../../common/utils/schedule-list-filters';

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
  async create(dto: unknown, user?: { id?: bigint }) {
    return saveProgramEditor(this.prisma, this.auditService, 'template', dto, user?.id, undefined);
  }

  // -----------------------------
  // GET ALL (NO AUDIT)
  // -----------------------------
  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const where = templateListWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.programTemplate.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],

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
  async update(id: string, dto: unknown, user?: { id?: bigint }) {
    return saveProgramEditor(this.prisma, this.auditService, 'template', dto, user?.id, id);
  }

  // -----------------------------
  // DELETE TEMPLATE
  // -----------------------------
  async remove(id: string, user?: any) {
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
      userId: user?.id,
    });

    return { success: true, data: {}, meta: {} };
  }
}
