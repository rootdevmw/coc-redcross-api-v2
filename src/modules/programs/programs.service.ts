import { saveProgramEditor, createProgramEditorFromTemplate } from '../../common/utils/program-editor';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';
import { SlugService } from 'src/common/utils/slugify';
import { programListWhere } from '../../common/utils/schedule-list-filters';
import { catalogTypeId, catalogTypeName, rethrowCatalogWrite } from '../../common/utils/type-catalog';
import {
  listPublicPrograms,
  readPublicProgram,
  listPublicProgramTypes,
  type PublicProgramQuery,
} from '../../common/utils/public-programs';

@Injectable()
export class ProgramsService {
  private readonly logger = new Logger(ProgramsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private slugify: SlugService,
  ) {}

  // -----------------------------
  // CREATE PROGRAM
  // -----------------------------
  async create(dto: unknown, user?: { id?: bigint }) {
    return saveProgramEditor(this.prisma, this.auditService, 'program', dto, user?.id, undefined, this.slugify);
  }

  // -----------------------------
  // CREATE FROM TEMPLATE
  // -----------------------------
  async createFromTemplate(dto: unknown, user?: { id?: bigint }) {
    return createProgramEditorFromTemplate(this.prisma, this.auditService, this.slugify, dto, user?.id);
  }

  // -----------------------------
  // FIND ALL (NO AUDIT)
  // -----------------------------
  findPublic(query: PublicProgramQuery = {}) {
    return listPublicPrograms(this.prisma, query);
  }

  getPublicTypes() {
    return listPublicProgramTypes(this.prisma);
  }

  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const where = programListWhere(query);

    const orderDir: 'asc' | 'desc' = query.fromDate ? 'asc' : 'desc';

    const [data, total] = await Promise.all([
      this.prisma.program.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ date: orderDir }, { id: orderDir }],
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
  // FIND BY SLUG
  // -----------------------------
  findBySlug(slug: string) {
    return readPublicProgram(this.prisma, slug);
  }

  // -----------------------------
  // UPDATE PROGRAM
  // -----------------------------
  async update(id: string, dto: unknown, user?: { id?: bigint }) {
    return saveProgramEditor(this.prisma, this.auditService, 'program', dto, user?.id, id, this.slugify);
  }

  // -----------------------------
  // DELETE PROGRAM
  // -----------------------------
  async remove(id: string, user?: any) {
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
      userId: user?.id,
    });

    return { success: true, data: {}, meta: {} };
  }

  // -----------------------------
  // PROGRAM TYPES
  // -----------------------------
  async createType(name: string, user?: { id?: bigint }) {
    const validName = catalogTypeName(name);
    const type = await this.prisma.programType.create({
      data: { name: validName },
    }).catch(rethrowCatalogWrite);

    await this.auditService.log({
      action: 'PROGRAM_TYPE_CREATED', entity: 'ProgramType',
      entityId: type.id.toString(), after: type, userId: user?.id,
    });

    return { success: true, data: type, meta: {} };
  }

  async updateType(id: string, name: string, user?: any) {
    this.logger.log(`UPDATE_PROGRAM_TYPE_STARTED: id=${id}`);

    const typeId = catalogTypeId(id);
    const validName = catalogTypeName(name);

    const before = await this.prisma.programType.findFirst({
      where: { id: typeId, deletedAt: null },
    });

    if (!before) {
      this.logger.warn(`UPDATE_PROGRAM_TYPE_NOT_FOUND: id=${id}`);
      throw new NotFoundException('Program type not found');
    }

    const after = await this.prisma.programType.update({
      where: { id: typeId },
      data: { name: validName },
    }).catch(rethrowCatalogWrite);

    await this.auditService.log({
      action: 'PROGRAM_TYPE_UPDATED',
      entity: 'ProgramType',
      entityId: id,
      before,
      after,
      userId: user?.id,
    });

    this.logger.log(`UPDATE_PROGRAM_TYPE_SUCCESS: id=${id}`);

    return { success: true, data: after, meta: {} };
  }

  async getTypes() {
    const types = await this.prisma.programType.findMany({
      where: { deletedAt: null },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return { success: true, data: types, meta: {} };
  }

  async removeType(id: string, user?: { id?: bigint }) {
    const typeId = catalogTypeId(id);
    const before = await this.prisma.$transaction(async (tx) => {
      const type = await tx.programType.findFirst({ where: { id: typeId, deletedAt: null } });
      if (!type) throw new NotFoundException('Program type not found');
      const [programs, templates] = await Promise.all([
        tx.program.count({ where: { typeId, deletedAt: null } }),
        tx.programTemplate.count({ where: { typeId, deletedAt: null } }),
      ]);
      if (programs || templates) {
        throw new ConflictException('This type is used by programs or templates. Reassign those records before deleting it.');
      }
      await tx.programType.update({ where: { id: typeId }, data: { deletedAt: new Date() } });
      return type;
    }, { isolationLevel: 'Serializable' });
    await this.auditService.log({ action: 'PROGRAM_TYPE_DELETED', entity: 'ProgramType', entityId: id, before, userId: user?.id });
    return { success: true, data: {}, meta: {} };
  }
}
