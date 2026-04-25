import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuditReaderService {
  constructor(private prisma: PrismaService) {}

  // -----------------------------
  // ENTITY LIST VIEW
  // -----------------------------
  async findByEntity(params: {
    entity: string;
    page: number;
    limit: number;
    action?: string;
    search?: string;
  }) {
    const { entity, page, limit, action, search } = params;

    const where: any = {
      entity,
    };

    if (action) {
      where.action = action;
    }

    if (search) {
      where.entityId = {
        contains: search,
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),

      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
      },
    };
  }

  // -----------------------------
  // SINGLE ENTITY RECORD TIMELINE
  // -----------------------------
  async findEntityTimeline(params: { entity: string; entityId: string }) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        entity: params.entity,
        entityId: params.entityId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      data: logs,
    };
  }

  // -----------------------------
  // GLOBAL SEARCH (optional future)
  // -----------------------------
  async searchAll(params: { search: string; page: number; limit: number }) {
    const where = {
      OR: [
        { entity: { contains: params.search } },
        { entityId: { contains: params.search } },
        { action: { contains: params.search } },
      ],
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: params.page,
        limit: params.limit,
        total,
      },
    };
  }
}
