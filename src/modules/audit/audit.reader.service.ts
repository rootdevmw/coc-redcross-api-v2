import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AuditReaderService {
  constructor(private prisma: PrismaService) {}

  private normalize(value: string) {
    return value
      ?.trim()
      .replace(/-/g, '_')
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toUpperCase();
  }

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
    const entity = this.normalize(params.entity);
    const action = params.action ? this.normalize(params.action) : undefined;

    const where: any = {
      entity,
    };

    if (action) {
      where.action = action;
    }

    if (params.search) {
      where.entityId = {
        contains: params.search,
      };
    }

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

  // -----------------------------
  // TIMELINE
  // -----------------------------
  async findEntityTimeline(params: { entity: string; entityId: string }) {
    const entity = this.normalize(params.entity);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        entity,
        entityId: params.entityId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { data: logs };
  }
}
