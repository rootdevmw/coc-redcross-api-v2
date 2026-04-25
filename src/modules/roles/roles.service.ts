import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toBigIntOptional } from 'src/common/utils/to-bigint';
import { Audit } from 'src/common/decorators/audit.decorator';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private prisma: PrismaService) {}

  // -----------------------------
  // CREATE ROLE
  // -----------------------------
  @Audit({
    action: 'ROLE_CREATED',
    entity: 'Role',
  })
  async create(dto: any) {
    this.logger.log(`Creating role: ${dto.name}`);

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

    return {
      success: true,
      data: role,
      meta: {},
    };
  }

  // -----------------------------
  // GET ALL (NO AUDIT)
  // -----------------------------
  async findAll(query: any) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    const [data, total] = await Promise.all([
      this.prisma.role.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.role.count(),
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
  @Audit({
    action: 'ROLE_UPDATED',
    entity: 'Role',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async update(id: string, dto: any) {
    this.logger.log(`Updating role ${id}`);

    const role = await this.prisma.role.update({
      where: { id: toBigIntOptional(id) },
      data: {
        name: dto.name,
      },
    });

    return {
      success: true,
      data: role,
      meta: {},
    };
  }

  // -----------------------------
  // DELETE ROLE
  // -----------------------------
  @Audit({
    action: 'ROLE_DELETED',
    entity: 'Role',
    idParamIndex: 0,
    fetchBefore: true,
  })
  async remove(id: string) {
    this.logger.log(`Deleting role ${id}`);

    await this.prisma.role.delete({
      where: { id: toBigIntOptional(id) },
    });

    return {
      success: true,
      data: {},
      meta: {},
    };
  }
}
