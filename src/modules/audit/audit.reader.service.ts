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

  private async attachUsers<T extends { userId?: bigint | null }>(logs: T[]) {
    const userIds = Array.from(
      new Set(
        logs
          .map((log) => log.userId)
          .filter((userId): userId is bigint => userId !== null && userId !== undefined),
      ),
    );

    if (!userIds.length) {
      return logs.map((log) => ({ ...log, user: null }));
    }

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
      },
      include: {
        roles: { include: { role: true } },
        member: true,
      },
    });

    const usersById = new Map(users.map((user) => [user.id.toString(), user]));

    return logs.map((log) => ({
      ...log,
      user: log.userId ? usersById.get(log.userId.toString()) ?? null : null,
    }));
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

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data = await this.attachUsers(logs);

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

    return { data: await this.attachUsers(logs) };
  }
}
