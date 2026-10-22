import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import { AuditService } from '../audit/audit.service';
import { accessListPagination, roleListWhere, type AccessListQuery } from '../../common/utils/access-list-filters';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // -----------------------------
  // CREATE ROLE
  // -----------------------------
  async create(dto: any, user?: any) {
    this.logger.log(`CREATE_ROLE_STARTED: ${dto.name}`);

    const existing = await this.prisma.role.findFirst({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`Role ${dto.name} already exists`);
    }

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
      },
    });

    await this.auditService.log({
      action: 'ROLE_CREATED',
      entity: 'Role',
      entityId: role.id.toString(),
      after: role,
      userId: user?.id,
    });

    this.logger.log(`CREATE_ROLE_SUCCESS: ${role.id}`);

    return {
      success: true,
      data: role,
      meta: {},
    };
  }

  // -----------------------------
  // GET ALL (NO AUDIT)
  // -----------------------------
  async findAll(query: AccessListQuery) {
    const { page, limit } = accessListPagination(query);
    const where = roleListWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.role.count({ where }),
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
    const role = await this.prisma.role.findFirst({
      where: { id: toBigIntOptional(id) },
    });

    if (!role) throw new NotFoundException(`Role with ID ${id} not found`);

    return {
      success: true,
      data: role,
      meta: {},
    };
  }

  // -----------------------------
  // UPDATE ROLE
  // -----------------------------
  async update(id: string, dto: any, user?: any) {
    const roleId = toBigIntOptional(id);

    this.logger.log(`UPDATE_ROLE_STARTED: ${id}`);

    const before = await this.prisma.role.findFirst({
      where: { id: roleId },
    });

    if (!before) {
      throw new NotFoundException(`Role not found`);
    }

    const after = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: dto.name,
      },
    });

    await this.auditService.log({
      action: 'ROLE_UPDATED',
      entity: 'Role',
      entityId: id,
      before,
      after,
      userId: user?.id,
    });

    this.logger.log(`UPDATE_ROLE_SUCCESS: ${id}`);

    return {
      success: true,
      data: after,
      meta: {},
    };
  }

  // -----------------------------
  // DELETE ROLE
  // -----------------------------
  async remove(id: string, user?: any) {
    const roleId = toBigIntOptional(id);

    this.logger.warn(`DELETE_ROLE_STARTED: ${id}`);

    const before = await this.prisma.role.findFirst({
      where: { id: roleId },
    });

    if (!before) {
      throw new NotFoundException(`Role not found`);
    }

    await this.prisma.role.delete({
      where: { id: roleId },
    });

    await this.auditService.log({
      action: 'ROLE_DELETED',
      entity: 'Role',
      entityId: id,
      before,
      userId: user?.id,
    });

    this.logger.warn(`DELETE_ROLE_SUCCESS: ${id}`);

    return {
      success: true,
      data: {},
      meta: {},
    };
  }
}
