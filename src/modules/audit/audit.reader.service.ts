import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import type { AuditLog } from '../../generated/prisma/client';
import {
  accessListPagination,
  auditEntityWhere,
  auditListWhere,
  type AccessListQuery,
} from '../../common/utils/access-list-filters';
import { protectAuditSnapshot } from './audit-response';

@Injectable()
export class AuditReaderService {
  constructor(private prisma: PrismaService) {}

  private async attachUsers(logs: AuditLog[]) {
    const userIds = Array.from(
      new Set(
        logs
          .map((log) => log.userId)
          .filter(
            (userId): userId is bigint =>
              userId !== null && userId !== undefined,
          ),
      ),
    );

    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: { in: userIds },
          },
          select: {
            id: true,
            email: true,
            member: { select: { firstName: true, lastName: true } },
          },
        })
      : [];

    const usersById = new Map(users.map((user) => [user.id.toString(), user]));

    return logs.map((log) => {
      const session =
        log.entity.replace(/[_\-\s]/g, '').toUpperCase() === 'SESSION';
      const before = protectAuditSnapshot(log.before, session);
      const after = protectAuditSnapshot(log.after, session);
      const actor = log.userId ? usersById.get(log.userId.toString()) : null;
      return {
        id: log.id,
        action: log.action,
        entity: log.entity,
        // Session IDs are bearer credentials, including when used as entity IDs.
        entityId: session ? null : log.entityId,
        userId: log.userId,
        description: log.description,
        createdAt: log.createdAt,
        before: before.value,
        after: after.value,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        user: actor
          ? {
              id: actor.id,
              email: actor.email,
              member: actor.member
                ? {
                    firstName: actor.member.firstName,
                    lastName: actor.member.lastName,
                  }
                : null,
            }
          : null,
        protectedFields:
          before.protectedFields ||
          after.protectedFields ||
          (session && !!log.entityId),
      };
    });
  }

  // -----------------------------
  // ENTITY LIST VIEW
  // -----------------------------
  async findByEntity(params: AccessListQuery & { entity: string }) {
    const { page, limit } = accessListPagination(params);
    const where = auditListWhere(params.entity, params);

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data = await this.attachUsers(logs);

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
  // TIMELINE
  // -----------------------------
  async findEntityTimeline(params: { entity: string; entityId: string }) {
    const entity = auditEntityWhere(params.entity);

    const logs = await this.prisma.auditLog.findMany({
      where: {
        entity,
        entityId: params.entityId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return { data: await this.attachUsers(logs) };
  }
}
